import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordProblem } from '../lib/account-password.ts';

test('mot de passe — 12 caractères minimum, 72 au maximum', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 12);
  assert.match(passwordProblem('a'.repeat(11)), /au moins 12/);
  assert.equal(passwordProblem('a'.repeat(12)), undefined);
  assert.equal(passwordProblem('a'.repeat(MAX_PASSWORD_LENGTH)), undefined);
  assert.match(passwordProblem('a'.repeat(MAX_PASSWORD_LENGTH + 1)), /72 caractères au maximum/);
});

test('mot de passe — pas d’espace invisible au début ni à la fin', () => {
  assert.match(passwordProblem(' motdepasselong'), /espace/);
  assert.match(passwordProblem('motdepasselong '), /espace/);
  assert.equal(passwordProblem('mot de passe long'), undefined);
});

test('mot de passe — la confirmation doit être identique', () => {
  assert.match(passwordProblem('motdepasselong', 'motdepasselonG'), /ne correspondent pas/);
  assert.equal(passwordProblem('motdepasselong', 'motdepasselong'), undefined);
});
