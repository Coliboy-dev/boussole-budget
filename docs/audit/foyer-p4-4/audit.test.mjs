// Audit contradictoire de la PR #32 : accès directs et RPC par profil, sur Postgres 16 local avec les rôles Supabase.
// PGHOST=/tmp/pg-audit32 PGPORT=55432 node --test audit.test.mjs
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { before, describe, test } from 'node:test';

const here = new URL('.', import.meta.url).pathname;
const migrationsDir = process.env.MIGRATIONS_DIR ?? new URL('../../../supabase/migrations/', import.meta.url).pathname;
const migrations = readdirSync(migrationsDir).sort();
const base = migrations.filter((name) => name < '20261122212700');
const added = migrations.filter((name) => name >= '20261122212700');
const env = { ...process.env, PGUSER: 'postgres', PGHOST: process.env.PGHOST ?? '/tmp/pg-audit32', PGPORT: process.env.PGPORT ?? '55432' };

function admin(db, sql) {
  return execFileSync('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-d', db, '-c', sql], { env, encoding: 'utf8' }).trim();
}
function adminFile(db, file) {
  execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', db, '-f', file], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function fresh(db, files) {
  admin('postgres', `drop database if exists ${db}`);
  admin('postgres', `create database ${db}`);
  adminFile(db, `${here}supabase-stub.sql`);
  for (const file of files) adminFile(db, `${migrationsDir}${file}`);
}

// Exécute une requête comme le ferait PostgREST : rôle de la session et revendications du jeton.
function as(db, who, sql) {
  const role = who === 'anon' ? 'anon' : 'authenticated';
  const claims = JSON.stringify(who === 'anon' ? { role: 'anon' } : { role: 'authenticated', sub: users[who] });
  const script = `\\set VERBOSITY verbose\nbegin;\nset local role ${role};\nselect set_config('request.jwt.claims', '${claims}', true) \\g /dev/null\n${sql};\ncommit;\n`;
  const run = spawnSync('psql', ['-X', '-q', '-A', '-t', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-d', db], { env, input: script, encoding: 'utf8' });
  const code = run.stderr.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1];
  return { ok: run.status === 0, out: run.stdout.trim(), code, err: run.stderr.trim() };
}
function ok(result, label) {
  assert.ok(result.ok, `${label} : ${result.err}`);
  return result.out;
}
function denied(result, label, code = '42501') {
  assert.equal(result.ok, false, `${label} aurait dû échouer, sortie : ${result.out}`);
  assert.equal(result.code, code, `${label} : ${result.err}`);
}

const users = {
  A: '0000000a-0000-4000-8000-000000000001', // membre actif, créateur
  B: '0000000b-0000-4000-8000-000000000002', // membre actif, invité
  C: '0000000c-0000-4000-8000-000000000003', // ancien membre du foyer
  D: '0000000d-0000-4000-8000-000000000004', // membre d'un autre foyer
};
const token = (letter) => letter.repeat(43);
const hash = (letter) => `encode(sha256(convert_to('${token(letter)}', 'UTF8')), 'hex')`;
const rec = (writeId, recordId, extra = '') => `{"write_id":"${writeId}","record_id":"${recordId}","key_version":1,"ciphertext":"chiffre-0123456789abcdef","iv":"iv-01234567","deleted":false${extra}}`;
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// Foyer H : A et C, C écrit puis part, B rejoint. Foyer H3 : D seul. Écritures avant migration.
function seed(db) {
  admin(db, `insert into auth.users (id) values ${Object.values(users).map((id) => `('${id}')`).join(',')}`);
  const [h, mA] = ok(as(db, 'A', 'select household_id, member_id from public.create_household()'), 'A crée H').split('|');
  const invC = ok(as(db, 'A', `select public.create_invitation('${h}', ${hash('c')})`), 'invitation C');
  const mC = ok(as(db, 'C', `select member_id from public.accept_invitation('${invC}', '${token('c')}')`), 'C rejoint');
  ok(as(db, 'A', `select * from public.upsert_records('${h}', '[${rec(uuid(1), uuid(101))}]')`), 'A écrit avant migration');
  ok(as(db, 'C', `select * from public.upsert_records('${h}', '[${rec(uuid(2), uuid(102))}]')`), 'C écrit avant migration');
  ok(as(db, 'C', `select public.leave_household('${h}')`), 'C part');
  const invB = ok(as(db, 'A', `select public.create_invitation('${h}', ${hash('b')})`), 'invitation B');
  const mB = ok(as(db, 'B', `select member_id from public.accept_invitation('${invB}', '${token('b')}')`), 'B rejoint');
  const [h3, mD] = ok(as(db, 'D', 'select household_id, member_id from public.create_household()'), 'D crée H3').split('|');
  return { h, h3, mA, mB, mC, mD };
}

const db = 'audit_new';
let ids;
before(() => {
  fresh(db, base);
  ids = seed(db);
  for (const file of added) adminFile(db, `${migrationsDir}${file}`);
});

describe('Accès directs aux tables après migration', () => {
  const sensitive = [
    ['household_members', 'user_id'], ['household_records', 'created_by'], ['household_records', 'updated_by'],
    ['household_invitations', 'created_by'], ['household_invitations', 'token_hash'],
  ];
  for (const who of ['A', 'B', 'C', 'D', 'anon']) {
    test(`${who} ne lit aucun identifiant de compte ni jeton d'invitation`, () => {
      for (const [table, column] of sensitive) denied(as(db, who, `select ${column} from public.${table}`), `${who} ${table}.${column}`);
      for (const table of ['household_members', 'household_records', 'household_invitations', 'household_writes']) {
        denied(as(db, who, `select * from public.${table}`), `${who} ${table}.*`);
      }
      denied(as(db, who, 'select user_id from public.household_members where user_id is not null'), `${who} filtre sur user_id`);
    });
  }

  test('A et B lisent les adhésions de H, avec les identifiants de membre seulement', () => {
    for (const who of ['A', 'B']) {
      const rows = ok(as(db, who, 'select household_id, member_id, removed_at is not null from public.household_members order by joined_at'), who).split('\n');
      assert.deepEqual(rows, [`${ids.h}|${ids.mA}|f`, `${ids.h}|${ids.mC}|t`, `${ids.h}|${ids.mB}|f`], who);
    }
  });
  test('C (ancien membre) ne lit plus rien de H', () => {
    for (const table of ['households', 'household_members', 'household_records']) {
      assert.equal(ok(as(db, 'C', `select count(*) from public.${table} where ${table === 'households' ? 'id' : 'household_id'} = '${ids.h}'`), table), '0');
    }
  });
  test('D (autre foyer) ne lit rien de H, seulement H3', () => {
    assert.equal(ok(as(db, 'D', `select count(*) from public.household_records where household_id = '${ids.h}'`), 'D'), '0');
    assert.equal(ok(as(db, 'D', 'select string_agg(household_id::text, \',\') from public.household_members'), 'D'), ids.h3);
    assert.equal(ok(as(db, 'D', 'select string_agg(id::text, \',\') from public.households'), 'D'), ids.h3);
  });
  test('anonyme : aucune table du foyer lisible', () => {
    for (const table of ['households', 'household_members', 'household_records']) denied(as(db, 'anon', `select 1 from public.${table}`), `anon ${table}`);
  });
  test('aucune écriture directe possible, pour personne', () => {
    for (const who of ['A', 'B', 'C', 'D', 'anon']) {
      denied(as(db, who, `update public.household_records set deleted = true where household_id = '${ids.h}'`), `${who} update`);
      denied(as(db, who, `insert into public.household_members (household_id, user_id) values ('${ids.h}', '${users.D}')`), `${who} insert`);
      denied(as(db, who, `delete from public.household_records where household_id = '${ids.h}'`), `${who} delete`);
    }
  });
});

describe('RPC après migration', () => {
  test('pull_records : colonnes renvoyées sans identifiant de compte', () => {
    const columns = admin(db, `select array_to_string(proargnames, ',') from pg_proc where proname = 'pull_records'`);
    assert.equal(columns, 'h,after_seq,household_id,record_id,seq,key_version,ciphertext,iv,deleted,updated_at,author_member_id,editor_member_id,exclusive');
  });
  test('pull_records : A et B lisent H ; C, D refusés ; anonyme sans droit d\'exécution', () => {
    for (const who of ['A', 'B']) assert.match(ok(as(db, who, `select count(*) from public.pull_records('${ids.h}', 0)`), who), /^[1-9]/);
    for (const who of ['C', 'D']) denied(as(db, who, `select * from public.pull_records('${ids.h}', 0)`), who);
    denied(as(db, 'anon', `select * from public.pull_records('${ids.h}', 0)`), 'anon');
  });
  test('list_my_households : chacun ne voit que ses adhésions actives', () => {
    assert.equal(ok(as(db, 'A', 'select household_id, member_id, array_length(active_member_ids, 1) from public.list_my_households()'), 'A'), `${ids.h}|${ids.mA}|2`);
    assert.equal(ok(as(db, 'B', 'select member_id from public.list_my_households()'), 'B'), ids.mB);
    assert.equal(ok(as(db, 'C', 'select count(*) from public.list_my_households()'), 'C'), '0');
    assert.equal(ok(as(db, 'D', 'select household_id from public.list_my_households()'), 'D'), ids.h3);
    const active = ok(as(db, 'A', 'select array_to_string(active_member_ids, \',\') from public.list_my_households()'), 'A').split(',').sort();
    assert.deepEqual(active, [ids.mA, ids.mB].sort());
    denied(as(db, 'anon', 'select * from public.list_my_households()'), 'anon');
  });
  test('upsert_records : C, D refusés, anonyme sans droit d\'exécution', () => {
    for (const who of ['C', 'D']) denied(as(db, who, `select * from public.upsert_records('${ids.h}', '[${rec(uuid(30), uuid(130))}]')`), who);
    denied(as(db, 'anon', `select * from public.upsert_records('${ids.h}', '[${rec(uuid(31), uuid(131))}]')`), 'anon');
  });
  test('élément exclusif : seul l\'auteur le modifie ou le supprime ; auteur fixé par le serveur', () => {
    ok(as(db, 'A', `select * from public.upsert_records('${ids.h}', '[${rec(uuid(40), uuid(140), ',"exclusive":true')}]')`), 'A crée un exclusif');
    denied(as(db, 'B', `select * from public.upsert_records('${ids.h}', '[${rec(uuid(41), uuid(140))}]')`), 'B modifie');
    denied(as(db, 'B', `select * from public.upsert_records('${ids.h}', '[${rec(uuid(42), uuid(140)).replace('"deleted":false', '"deleted":true')}]')`), 'B supprime');
    // Rejouer le reçu de A ne contourne pas le contrôle.
    denied(as(db, 'B', `select * from public.upsert_records('${ids.h}', '[${rec(uuid(40), uuid(140))}]')`), 'B rejoue le reçu de A');
    ok(as(db, 'A', `select * from public.upsert_records('${ids.h}', '[${rec(uuid(43), uuid(140))}]')`), 'A modifie');
    const row = ok(as(db, 'B', `select author_member_id, editor_member_id, exclusive from public.pull_records('${ids.h}', 0) where record_id = '${uuid(140)}'`), 'B lit');
    assert.equal(row, `${ids.mA}|${ids.mA}|t`);
    // B ne peut pas se déclarer auteur ni retirer l'exclusivité par la charge utile.
    ok(as(db, 'B', `select * from public.upsert_records('${ids.h}', '[${rec(uuid(44), uuid(150), ',"author_member_id":"' + ids.mA + '","exclusive":true')}]')`), 'B crée');
    assert.equal(ok(as(db, 'A', `select author_member_id from public.pull_records('${ids.h}', 0) where record_id = '${uuid(150)}'`), 'A lit'), ids.mB);
  });
  test('élément partagé : B modifie celui de A, l\'auteur reste A, le dernier rédacteur devient B', () => {
    ok(as(db, 'A', `select * from public.upsert_records('${ids.h}', '[${rec(uuid(50), uuid(160))}]')`), 'A crée');
    ok(as(db, 'B', `select * from public.upsert_records('${ids.h}', '[${rec(uuid(51), uuid(160))}]')`), 'B modifie');
    assert.equal(ok(as(db, 'A', `select author_member_id, editor_member_id, exclusive from public.pull_records('${ids.h}', 0) where record_id = '${uuid(160)}'`), 'A'), `${ids.mA}|${ids.mB}|f`);
  });
  test('rattrapage : les écritures d\'avant migration sont attribuées à leur rédacteur, même après suppression du compte', () => {
    assert.equal(ok(as(db, 'A', `select editor_member_id, author_member_id is null from public.pull_records('${ids.h}', 0) where record_id = '${uuid(102)}'`), 'A'), `${ids.mC}|t`);
    admin(db, `delete from auth.users where id = '${users.C}'`);
    assert.equal(ok(as(db, 'A', `select editor_member_id from public.pull_records('${ids.h}', 0) where record_id = '${uuid(102)}'`), 'A'), ids.mC);
    assert.equal(admin(db, `select updated_by is null from public.household_records where record_id = '${uuid(102)}'`), 't');
  });
});

describe('Droits d\'exécution et chemins de lecture (catalogue)', () => {
  test('anonyme : aucune fonction de public exécutable', () => {
    const anon = admin(db, `select string_agg(p.oid::regprocedure::text, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`);
    assert.equal(anon, '', `exécutables par anon : ${anon}`);
  });
  test('PUBLIC n\'a d\'exécution sur aucune fonction de public', () => {
    const open = admin(db, `select string_agg(p.oid::regprocedure::text, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))`);
    assert.equal(open, '', `ouvertes à PUBLIC : ${open}`);
  });
  test('upsert_records, pull_records, list_my_households : exécution réservée à authenticated', () => {
    for (const fn of ['upsert_records(uuid,jsonb)', 'pull_records(uuid,bigint)', 'list_my_households()']) {
      const acl = admin(db, `select string_agg(distinct coalesce(nullif(a.grantee::regrole::text, '-'), 'PUBLIC'), ',' order by coalesce(nullif(a.grantee::regrole::text, '-'), 'PUBLIC'))
        from aclexplode((select proacl from pg_proc where oid = 'public.${fn}'::regprocedure)) a where a.privilege_type = 'EXECUTE'`);
      // service_role (clé serveur secrète, hors client) garde l'exécution d'upsert_records depuis la migration de main : sans effet, auth.uid() y est vide.
      assert.equal(acl.replace(',service_role', ''), 'authenticated,postgres', fn);
      assert.equal(admin(db, `select prosecdef and 'search_path=""' = any(proconfig) from pg_proc where oid = 'public.${fn}'::regprocedure`), 't', `${fn} security definer, search_path vide`);
    }
  });
  test('aucune fonction exécutable par authenticated ne renvoie un identifiant de compte', () => {
    // Seules les valeurs renvoyées comptent : create_invitation reçoit token_hash en entrée sans le renvoyer.
    const leaks = admin(db, `select string_agg(p.oid::regprocedure::text || ' → ' || pg_get_function_result(p.oid), '; ')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
        and (pg_get_function_result(p.oid) ~ '(user_id|created_by|updated_by|token_hash)'
          or p.prorettype in ('public.household_records'::regtype, 'public.household_members'::regtype, 'public.household_invitations'::regtype))`);
    assert.equal(leaks, '', leaks);
  });
  test('colonnes lisibles par authenticated : aucun identifiant de compte hors de son propre coffre', () => {
    const readable = admin(db, `select string_agg(table_name || '.' || column_name, ',' order by table_name, column_name)
      from information_schema.columns c where table_schema = 'public'
        and has_column_privilege('authenticated', format('public.%I', table_name), column_name, 'select')
        and column_name in ('user_id','created_by','updated_by','token_hash')`);
    // budget_vaults.user_id reste lisible : la règle RLS limite la lecture au coffre de l'utilisateur.
    assert.equal(readable, 'budget_vaults.user_id');
  });
  test('aucune vue ni fonction de public ne contourne la table des adhésions', () => {
    assert.equal(admin(db, `select count(*) from information_schema.views where table_schema = 'public'`), '0');
  });
});

describe('Compatibilité ancien client et nouveau schéma', () => {
  test('ancien listHouseholds (filtre sur household_members.user_id) : refusé, le Foyer s\'affiche indisponible', () => {
    denied(as(db, 'A', `select h.id, h.key_version, h.created_at, m.member_id from public.households h
      join public.household_members m on m.household_id = h.id where m.user_id = '${users.A}' and m.removed_at is null`), 'ancien listHouseholds');
  });
  test('ancien pull_records : updated_by n\'est plus renvoyé', () => {
    assert.doesNotMatch(admin(db, `select array_to_string(proargnames, ',') from pg_proc where proname = 'pull_records'`), /updated_by/);
  });
  test('ancien upsert_records (sans exclusive) : accepté, élément non exclusif attribué au rédacteur', () => {
    ok(as(db, 'B', `select * from public.upsert_records('${ids.h}', '[${rec(uuid(60), uuid(170))}]')`), 'B ancien format');
    assert.equal(ok(as(db, 'A', `select author_member_id, exclusive from public.pull_records('${ids.h}', 0) where record_id = '${uuid(170)}'`), 'A'), `${ids.mB}|f`);
  });
});
