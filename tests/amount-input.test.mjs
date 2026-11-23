import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { amountInputValue, parseAmountInput, parseOptionalAmount } from '../lib/money.ts';

test('parseAmountInput : notation belge et internationale, deux décimales au maximum', () => {
  assert.equal(parseAmountInput('12,34'), 12.34);
  assert.equal(parseAmountInput('12.34'), 12.34);
  assert.equal(parseAmountInput(' 1 234,50 '), 1234.5);
  assert.equal(parseAmountInput('1 234,5'), 1234.5);
  assert.equal(parseAmountInput('-45,10'), -45.1);
  assert.ok(Number.isNaN(parseAmountInput('12,345')), 'trois décimales : ambigu, refusé');
  assert.ok(Number.isNaN(parseAmountInput('1.234,50')), 'point des milliers : refusé plutôt que mal lu');
  assert.ok(Number.isNaN(parseAmountInput('')));
  assert.ok(Number.isNaN(parseAmountInput('12 €')));
});

test('parseOptionalAmount : vide = valeur par défaut, saisie invalide jamais remplacée par zéro', () => {
  assert.equal(parseOptionalAmount('', 0), 0);
  assert.equal(parseOptionalAmount('  ', 0), 0);
  assert.equal(parseOptionalAmount('7,5', 0), 7.5);
  assert.ok(Number.isNaN(parseOptionalAmount('abc', 0)));
});

test('amountInputValue : montant enregistré relu avec une virgule', () => {
  assert.equal(amountInputValue(12.34), '12,34');
  assert.equal(amountInputValue(-3), '-3');
  assert.equal(amountInputValue(undefined), undefined);
  assert.equal(parseAmountInput(amountInputValue(1234.5)), 1234.5);
});

test('Aucun champ type="number" dans l’app : Chrome peut y avaler la virgule (« 12,34 » lu 1 234)', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx$/.test(name) && /type=(?:"number"|\{?'number')/.test(readFileSync(path, 'utf8'))) offenders.push(path);
    }
  };
  for (const dir of ['app', 'components']) walk(new URL(`../${dir}`, import.meta.url).pathname);
  assert.deepEqual(offenders, []);
});
