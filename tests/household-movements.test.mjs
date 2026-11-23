import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateBudgetSummary } from '../lib/budget-calculations.ts';
import { emptyBudgetState, serializeBudget } from '../lib/budget-state.ts';
import { diffHousehold } from '../lib/household-diff.ts';
import { materializeHousehold } from '../lib/household-materialize.ts';
import {
  applyMovementMirrors, declarationHash, householdMovementTotals, movementMirrors, resolveHouseholdTransfers,
} from '../lib/household-movements.ts';
import { decodeHouseholdView, encodeHouseholdWrites } from '../lib/household-sync.ts';
import { addSpending } from '../lib/spending.ts';
import { analyzeMonth } from '../lib/spending-analysis.ts';

process.env.TZ = 'Europe/Brussels';

const sam = 'sam';
const marc = 'marc';
const today = '2026-11-20';
const householdId = 'foyer';
const transferId = 'transfert';
const declaration = { transferId, fromMemberId: marc, toMemberId: sam, amount: 5000, date: today, revision: 'v1' };
const row = (kind, id, data, authorMemberId, seq) => ({
  record: { kind, id, data }, authorMemberId, seq, exclusive: true,
});
const initialTransfer = row('transfer', transferId, declaration, marc, 1);
const view = (rows, memberId = sam) => resolveHouseholdTransfers(rows, memberId, Math.max(0, ...rows.map(({ seq }) => seq)));

test('F-B · une avance compte dans l’enveloppe et l’analyse, sans débiter ni absorber un écart commun', () => {
  const envelopes = [{ id: 'courses', label: 'Courses', category: 'groceries', monthlyAmount: 400 }];
  const shared = { ...emptyBudgetState, currentBalance: 1000, balanceDate: '2026-11-10', envelopes };
  const advance = (id, amount, date, paidBy) => ({
    id, amount, date, paidFrom: 'personal', paidBy, category: 'groceries', balanceIncluded: true,
  });
  const after = addSpending(addSpending(shared, advance('a', 135, '2026-11-12', sam), today),
    advance('b', 40, '2026-11-15', marc), today);
  const available = (state) => calculateBudgetSummary(
    state.currentBalance, [], [], [], [], 50, [], today, { envelopes, spendings: state.spendings },
  ).trueAvailable;
  assert.equal(available(shared), 150);
  assert.equal(available(after), 325);
  assert.equal(after.currentBalance, 1000);
  assert.equal(analyzeMonth(after, '2026-11').totalCents, 17500);
  const withGap = analyzeMonth({ ...after, balanceGaps: [{ id: 'gap', fromDate: '2026-11-10', date: today, amount: 50 }] }, '2026-11');
  assert.equal(withGap.unrecordedCents, 5000);
});

test('F5 · une réponse exige un auteur et une révision valides, le plus grand numéro valide prévaut', async () => {
  const hash = await declarationHash(declaration);
  const answer = { transferId, declarationHash: hash, status: 'confirmed' };
  const forged = row('transfer-response', 'forged', answer, marc, 3);
  assert.equal((await view([initialTransfer, forged]))[0].status, 'declared');
  assert.deepEqual(await view([{ ...initialTransfer, authorMemberId: sam }]), []);

  const reply = row('transfer-response', 'reply', answer, sam, 2);
  assert.equal((await view([initialTransfer, forged, reply]))[0].status, 'confirmed');
  const edited = { ...declaration, amount: 8000, revision: 'v2' };
  const editedRow = row('transfer', transferId, edited, marc, 4);
  let [transfer] = await view([editedRow, reply]);
  assert.equal(transfer.status, 'declared');
  assert.equal(transfer.amount, 8000);
  assert.equal(transfer.history[0].status, 'confirmed');
  [transfer] = await view([row('transfer', transferId, { ...declaration, revision: 'v3' }, marc, 5), reply]);
  assert.equal(transfer.status, 'declared');

  const latest = row('transfer-response', 'latest', { ...answer, status: 'not_received' }, sam, 6);
  assert.equal((await view([initialTransfer, latest, reply]))[0].status, 'not_received');
  assert.equal((await view([initialTransfer, { ...reply, createdBy: null }]))[0].status, 'confirmed');
});

test('F-B · les miroirs ne débitent que leur auteur et créditent le destinataire une fois après la confirmation', async () => {
  const sharedSpending = (id, amount, paidBy) => ({ id, amount, label: 'Courses', paidFrom: 'personal', paidBy, date: today });
  const spendingRows = [
    { ...row('spending', 'a', sharedSpending('a', 13500, sam), sam, 1), updatedBy: sam },
    { ...row('spending', 'b', sharedSpending('b', 4000, marc), marc, 2), updatedBy: marc },
  ];
  const personal = { ...emptyBudgetState, currentBalance: 1000 };
  const mirror = async (state, member, answer) => {
    const rows = [...spendingRows, { ...initialTransfer, seq: 3 }, ...(answer ? [answer] : [])];
    const transfers = await view(rows, member);
    return applyMovementMirrors(state, movementMirrors(rows, transfers, householdId, member, member, 4), today);
  };
  const before = await mirror(personal, sam);
  assert.equal(before.currentBalance, 865);
  assert.equal(before.incomes.length, 0);
  const paidMarc = await mirror(personal, marc);
  assert.equal(paidMarc.currentBalance, 910);
  const response = (status) => row('transfer-response', 'reply', {
    transferId, declarationHash: hash, status,
  }, sam, 4);
  const hash = await declarationHash(declaration);
  assert.equal((await mirror(before, sam, response('not_received'))).currentBalance, 865);
  const paidSam = await mirror(before, sam, response('confirmed'));
  assert.equal(paidSam.currentBalance, 915);
  assert.equal(paidSam.incomes[0].occurrenceStatuses[today], 'paid');
  assert.equal(await mirror(paidSam, sam, response('confirmed')), paidSam);
  assert.equal(analyzeMonth(paidSam, '2026-11').totalCents, 0);
  assert.equal(analyzeMonth(paidSam, '2026-11').transfersCents, 13500);
  assert.equal(analyzeMonth(paidSam, '2026-11').receivedTransfersCents, 5000);
  assert.equal(analyzeMonth(paidMarc, '2026-11').transfersCents, 9000);
  assert.doesNotThrow(() => serializeBudget(paidSam));
  assert.deepEqual(householdMovementTotals(spendingRows.map(({ record }) => ({ ...record.data, amount: record.data.amount / 100 })),
    await view([initialTransfer, response('confirmed')])).map(({ memberId, netCents }) => [memberId, netCents]), [[sam, 8500], [marc, 9000]]);
});

test('F5 · la file transporte des éléments exclusifs chiffrés avec un UUID aléatoire pour la réponse', async () => {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const replyId = crypto.randomUUID();
  const [transfer, reply] = await encodeHouseholdWrites(key, { householdId, keyVersion: 1 }, [
    initialTransfer.record, { kind: 'transfer-response', id: replyId, data: { transferId, status: 'confirmed' } },
  ]);
  assert.equal(transfer.exclusive, true);
  assert.equal(reply.exclusive, true);
  assert.equal(reply.record_id, replyId);
  assert.equal(Object.hasOwn(transfer, 'amount'), false);
  const [decoded] = await decodeHouseholdView(key, householdId, {
    cursor: 1, pending: [], confirmed: [{ ...transfer, author_member_id: marc, seq: 1 }],
  });
  assert.equal(decoded.authorMemberId, marc);
  assert.equal(decoded.exclusive, true);
});

test('F6 · retirer une déclaration enlève son débit une seule fois et une copie ancienne ne le recrée pas', async () => {
  const original = { ...emptyBudgetState, currentBalance: 1000 };
  const before = movementMirrors([initialTransfer], await view([initialTransfer], marc), householdId, marc, marc, 1);
  const debited = applyMovementMirrors(original, before, today);
  assert.equal(debited.currentBalance, 950);
  const removed = row('transfer', transferId, undefined, marc, 2);
  const after = movementMirrors([removed], [], householdId, marc, marc, 2);
  const closed = applyMovementMirrors(debited, after, today);
  assert.equal(closed.currentBalance, 1000);
  assert.deepEqual(closed.spendings, []);
  assert.equal(applyMovementMirrors(closed, before, today), closed);
  assert.equal(applyMovementMirrors(closed, after, today), closed);
});

test('Sans compte commun · le réglage est synchronisé et reste absent des anciens foyers', () => {
  assert.equal(materializeHousehold([]).hasJointAccount, undefined);
  const records = diffHousehold(emptyBudgetState, { ...emptyBudgetState, hasJointAccount: false }, { rows: [] });
  assert.equal(materializeHousehold(records.map((record, index) => ({ seq: index + 1, record }))).hasJointAccount, false);
});
