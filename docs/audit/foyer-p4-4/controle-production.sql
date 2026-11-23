-- Contrôle en LECTURE SEULE du Foyer déployé (PR #32). À coller dans l'éditeur SQL de Supabase (production).
-- Ne modifie rien : une seule requête SELECT. Chaque ligne doit afficher ok = true.
-- Les empreintes attendues ont été calculées sur les migrations auditées (commit 607a8a9, identiques à main 515c2bf).
with
fn(name, sig, expected_md5) as (values
  ('upsert_records', 'public.upsert_records(uuid,jsonb)', 'be718e158fbf429584a369310a33d11a'),
  ('pull_records', 'public.pull_records(uuid,bigint)', '16707ec5e8b6de8b53a512926b14a474'),
  ('list_my_households', 'public.list_my_households()', '1731510cdaeaf0aa3d33e060550872ce'),
  ('set_household_record_editor', 'public.set_household_record_editor()', '477ca4259f648eef38ade18cc7ab36b9'),
  ('is_active_member', 'public.is_active_member(uuid)', '5019cc82cc56e40ff5ac577b49ccf800'),
  ('household_sync_version', 'public.household_sync_version()', '7eae603a6239c475ac3130e4b8a0ea14')
),
public_fn as (
  select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
),
grantees(sig, roles) as (
  select f.sig, coalesce(string_agg(distinct case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end, ','), '')
  from fn f
  left join pg_proc p on p.oid = to_regprocedure(f.sig)
  left join lateral aclexplode(p.proacl) a on a.privilege_type = 'EXECUTE'
  group by f.sig
),
checks(controle, attendu, obtenu) as (
  select 'Migrations 20261122212700 et 20261123003000 enregistrées', '2',
    (select count(*)::text from supabase_migrations.schema_migrations where version in ('20261122212700', '20261123003000'))
  union all
  select 'Corps de ' || f.name || ' identique à la version auditée', f.expected_md5,
    coalesce((select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure(f.sig)), 'absente')
  from fn f
  union all
  select 'Aucune fonction de public exécutable par anon', '',
    coalesce((select string_agg(oid::regprocedure::text, ', ') from public_fn where has_function_privilege('anon', oid, 'execute')), '')
  union all
  select 'Aucune fonction de public ouverte à PUBLIC', '',
    coalesce((select string_agg(p.oid::regprocedure::text, ', ') from pg_proc p join public_fn using (oid)
      where p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')), '')
  union all
  select 'Exécution de ' || g.sig || ' : authenticated, ni anon ni PUBLIC', 'oui',
    case when g.roles like '%authenticated%' and g.roles not like '%anon%' and g.roles not like '%PUBLIC%' then 'oui' else g.roles end
  from grantees g where g.sig in ('public.upsert_records(uuid,jsonb)', 'public.pull_records(uuid,bigint)', 'public.list_my_households()')
  union all
  select 'security definer et search_path vide : ' || f.name, 'oui',
    coalesce((select case when p.prosecdef and 'search_path=""' = any(p.proconfig) then 'oui' else 'non' end
      from pg_proc p where p.oid = to_regprocedure(f.sig)), 'absente')
  from fn f where f.name in ('upsert_records', 'pull_records', 'list_my_households')
  union all
  select 'Identifiants de compte lisibles par authenticated', 'budget_vaults.user_id',
    coalesce((select string_agg(table_name || '.' || column_name, ',' order by table_name, column_name)
      from information_schema.columns where table_schema = 'public'
        and column_name in ('user_id', 'created_by', 'updated_by', 'token_hash')
        and has_column_privilege('authenticated', format('public.%I', table_name), column_name, 'select')), '')
  union all
  select 'Identifiants de compte lisibles par anon', '',
    coalesce((select string_agg(table_name || '.' || column_name, ',')
      from information_schema.columns where table_schema = 'public'
        and column_name in ('user_id', 'created_by', 'updated_by', 'token_hash')
        and has_column_privilege('anon', format('public.%I', table_name), column_name, 'select')), '')
  union all
  select 'Écriture directe (insert, update, delete) sur les tables du foyer', '',
    coalesce((select string_agg(r || ' ' || t || ' ' || priv, ', ')
      from unnest(array['anon', 'authenticated']) r,
           unnest(array['households', 'household_members', 'household_records', 'household_invitations', 'household_writes']) t,
           unnest(array['INSERT', 'UPDATE', 'DELETE']) priv
      where has_table_privilege(r, format('public.%I', t), priv)), '')
  union all
  select 'RLS activée sur les tables du foyer et le coffre', '',
    coalesce((select string_agg(c.relname, ', ') from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ('households', 'household_members', 'household_records', 'household_invitations', 'household_writes', 'budget_vaults')
        and not c.relrowsecurity), '')
  union all
  select 'Politiques des tables du foyer (lecture authenticated seulement)', 'household_members:SELECT:{authenticated} household_records:SELECT:{authenticated} households:SELECT:{authenticated}',
    coalesce((select string_agg(tablename || ':' || cmd || ':' || roles::text, ' ' order by tablename)
      from pg_policies where schemaname = 'public' and tablename like 'household%'), '')
  union all
  select 'Déclencheur household_record_editor actif', 'O',
    coalesce((select tgenabled::text from pg_trigger where tgname = 'household_record_editor'), 'absent')
  union all
  select 'Contrainte exclusif ⇒ auteur', '1',
    (select count(*)::text from pg_constraint where conname = 'household_records_exclusive_author_check')
  union all
  select 'Tables du foyer publiées (Realtime)', '',
    coalesce((select string_agg(pubname || ':' || tablename, ', ') from pg_publication_tables
      where schemaname = 'public' and tablename like 'household%'), '')
  union all
  select 'Vues dans public', '0', (select count(*)::text from information_schema.views where table_schema = 'public')
)
select controle, attendu, obtenu, attendu = obtenu as ok from checks order by ok, controle;
