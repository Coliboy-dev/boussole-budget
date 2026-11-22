import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCurrency } from '../lib/budget-calculations.ts';
import { householdCopy, householdMessages } from '../lib/household-copy.ts';

process.env.TZ = 'Europe/Brussels';

const currency = (cents) => formatCurrency(cents / 100);
const examples = {
  contributionPending: [['2026-11-28'], 'Versement prévu le 28 — réception non confirmée'],
  shortfallBefore: [[12000, '2026-12-01'], `${currency(12000)} supplémentaires sont nécessaires avant le 1 déc. pour couvrir les échéances prévues`],
  dependsOnContributions: [['loyer', '2026-12-01', 2], 'Le paiement du loyer du 1er dépend de 2 versements encore attendus'],
  reserveShortfall: [[2000, '2026-12-01', false], `La réserve serait entamée de ${currency(2000)} le 1 déc.`],
  transfersForHousehold: [[80000], `Virements et avances pour le foyer : ${currency(80000)}`],
};

const prohibited = /\b(te|vous|lui|me) doi(t|s|vent)\b|\bdoi(t|s|vent) (payer|verser|rembourser|ajouter)\b|n['’]a (pas|toujours pas) (payé|versé|remboursé)|\btrop dépensé\b|\brappelle[- ]lui\b|\bexclu(e)?\b|\bparticipe moins\b|\bmauvaise? gestion\b|\bà rembourser\b/iu;

test('F-F · les textes du Foyer sont descriptifs et les formulations de référence sont stables', () => {
  assert.deepEqual(Object.keys(householdMessages).sort(), Object.keys(examples).sort());
  for (const [name, message] of Object.entries(householdCopy)) assert.doesNotMatch(message, prohibited, name);
  for (const [name, [params, expected]] of Object.entries(examples)) {
    const message = householdMessages[name](...params);
    assert.equal(message, expected, name);
    assert.doesNotMatch(message, prohibited, name);
  }
});
