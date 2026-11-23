// Compatibilité croisée client / schéma pour la PR #32, et retour arrière.
// PGHOST=/tmp/pg-audit32 PGPORT=55432 node --test compat.test.mjs
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';

const here = new URL('.', import.meta.url).pathname;
const migrationsDir = process.env.MIGRATIONS_DIR ?? new URL('../../../supabase/migrations/', import.meta.url).pathname;
const migrations = readdirSync(migrationsDir).sort();
const env = { ...process.env, PGUSER: 'postgres', PGHOST: process.env.PGHOST ?? '/tmp/pg-audit32', PGPORT: process.env.PGPORT ?? '55432' };
const A = '0000000a-0000-4000-8000-000000000001';

const admin = (db, sql) => execFileSync('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-d', db, '-c', sql], { env, encoding: 'utf8' }).trim();
const file = (db, path) => execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', db, '-f', path], { env, stdio: ['ignore', 'pipe', 'pipe'] });
function fresh(db, upTo) {
  admin('postgres', `drop database if exists ${db}`);
  admin('postgres', `create database ${db}`);
  file(db, `${here}supabase-stub.sql`);
  for (const name of migrations.filter((name) => name <= upTo)) file(db, `${migrationsDir}${name}`);
  admin(db, `insert into auth.users (id) values ('${A}')`);
}
function asA(db, sql) {
  const script = `\\set VERBOSITY verbose\nbegin;\nset local role authenticated;\nselect set_config('request.jwt.claims', '{"role":"authenticated","sub":"${A}"}', true) \\g /dev/null\n${sql};\ncommit;\n`;
  const run = spawnSync('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-d', db], { env, input: script, encoding: 'utf8' });
  return { ok: run.status === 0, out: run.stdout.trim(), code: run.stderr.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1], err: run.stderr };
}
const rec = (w, r) => `[{"write_id":"${w}","record_id":"${r}","key_version":1,"ciphertext":"chiffre-0123456789abcdef","iv":"iv-01234567","deleted":false}]`;

// Requêtes exactes des deux clients, traduites de PostgREST en SQL.
const oldList = `select h.id, m.member_id from public.households h join public.household_members m on m.household_id = h.id
  where m.user_id = '${A}' and m.removed_at is null`;
const oldPullHasUpdatedBy = (h) => `select updated_by is not null from public.pull_records('${h}', 0) limit 1`;
const newList = 'select household_id, member_id from public.list_my_households()';
const newCapability = 'select exclusive, author_member_id, editor_member_id from public.household_records limit 0';

test('nouveau client sur l\'ancien schéma (#32 fusionnée avant les migrations) : Foyer indisponible, aucune écriture', () => {
  fresh('compat_old', '20261122164000_household_writes.sql');
  assert.equal(asA('compat_old', newList).code, '42883', 'list_my_households absente');
  assert.equal(asA('compat_old', newCapability).code, '42703', 'contrôle de capacité : écritures bloquées');
});

test('ancien client sur le nouveau schéma (migrations avant la fusion) : Foyer indisponible, sans corruption', () => {
  fresh('compat_new', '99999999');
  const h = asA('compat_new', 'select household_id from public.create_household()').out;
  assert.equal(asA('compat_new', oldList).code, '42501', 'ancien listHouseholds refusé');
  assert.ok(asA('compat_new', `select * from public.upsert_records('${h}', '${rec('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101')}')`).ok, 'ancien format d\'écriture accepté');
  assert.equal(asA('compat_new', oldPullHasUpdatedBy(h)).code, '42703', 'updated_by absent de pull_records');
});

test('retour arrière non destructif : l\'ancien client refonctionne, les nouvelles données restent', () => {
  fresh('compat_back', '99999999');
  const h = asA('compat_back', 'select household_id from public.create_household()').out;
  assert.ok(asA('compat_back', `select * from public.upsert_records('${h}', '${rec('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000102').replace('"deleted":false', '"deleted":false,"exclusive":true')}')`).ok);
  file('compat_back', `${here}retour-arriere.sql`);
  assert.ok(asA('compat_back', oldList).ok, 'ancien listHouseholds');
  assert.equal(asA('compat_back', oldPullHasUpdatedBy(h)).out, 't', 'ancien pull_records avec updated_by');
  assert.ok(asA('compat_back', newList).ok, 'nouveau client toujours servi');
  assert.equal(asA('compat_back', `select exclusive, author_member_id is not null from public.household_records`).out, 't|t', 'exclusivité conservée');
  assert.equal(admin('compat_back', `select string_agg(distinct a.grantee::regrole::text, ',') from aclexplode((select proacl from pg_proc where oid = 'public.pull_records(uuid,bigint)'::regprocedure)) a where a.privilege_type = 'EXECUTE'`), 'authenticated,postgres');
});

test('les deux migrations passent sur une base qui a déjà des foyers et sont rejouables dans l\'ordre une seule fois', () => {
  fresh('compat_seq', '20261122164000_household_writes.sql');
  const h = asA('compat_seq', 'select household_id from public.create_household()').out;
  assert.ok(asA('compat_seq', `select * from public.upsert_records('${h}', '${rec('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000103')}')`).ok);
  for (const name of migrations.filter((name) => name > '20261122164000_household_writes.sql')) file('compat_seq', `${migrationsDir}${name}`);
  assert.equal(admin('compat_seq', 'select count(*) from public.household_records where editor_member_id is not null'), '1', 'rattrapage du rédacteur');
});
