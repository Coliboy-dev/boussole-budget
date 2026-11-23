import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeHouseholdDirectory, withFormerHousehold } from '../lib/household-storage.ts';

const a = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', keyVersion: 1, createdAt: '2026-11-01T00:00:00Z' };
const b = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', keyVersion: 1, createdAt: '2026-11-02T00:00:00Z' };

test('PR 5a · un départ retire le foyer actif, le désélectionne et le garde comme ancien foyer', () => {
  const left = withFormerHousehold({ selected: a.id, households: [a, b] }, a.id, '2026-11-23T10:00:00Z');
  assert.deepEqual(left, { selected: null, households: [b], former: [{ id: a.id, leftAt: '2026-11-23T10:00:00Z' }] });
  const again = withFormerHousehold(left, a.id, '2026-11-24T10:00:00Z');
  assert.deepEqual(again.former, [{ id: a.id, leftAt: '2026-11-24T10:00:00Z' }], 'pas de doublon');
});

const now = '2026-11-24T08:00:00Z';

test('PR 5a · la liste serveur remplace les adhésions sans perdre les anciens foyers', () => {
  const current = { selected: b.id, households: [b], former: [{ id: a.id, leftAt: '2026-11-23T10:00:00Z' }] };
  assert.deepEqual(mergeHouseholdDirectory(current, [b], now), current);
  // Un foyer rejoint à nouveau redevient actif et n'est plus un ancien foyer.
  assert.deepEqual(mergeHouseholdDirectory(current, [a, b], now), { selected: b.id, households: [a, b] });
  assert.deepEqual(mergeHouseholdDirectory({ selected: null, households: [] }, [a], now), { selected: null, households: [a] });
});

test('PR 5a · un foyer qui disparaît de la liste (partage arrêté par l’autre membre) devient un ancien foyer', () => {
  const current = { selected: b.id, households: [b], former: [{ id: a.id, leftAt: '2026-11-23T10:00:00Z' }] };
  assert.deepEqual(mergeHouseholdDirectory(current, [], now), {
    selected: null, households: [], former: [{ id: a.id, leftAt: '2026-11-23T10:00:00Z' }, { id: b.id, leftAt: now }],
  });
  // Un premier chargement sur un nouvel appareil n'invente aucun ancien foyer.
  assert.deepEqual(mergeHouseholdDirectory({ selected: null, households: [] }, [], now), { selected: null, households: [] });
});
