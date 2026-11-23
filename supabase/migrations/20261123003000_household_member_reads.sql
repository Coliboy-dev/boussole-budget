alter table public.household_records add column editor_member_id uuid;

comment on column public.household_records.editor_member_id is
  'Dernier membre ayant écrit cet élément. Son identifiant de foyer est conservé après la suppression du compte.';

update public.household_records as r
  set editor_member_id = m.member_id
  from public.household_members as m
  where m.household_id = r.household_id and m.user_id = r.updated_by;

create function public.set_household_record_editor() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_by is not null then
    select m.member_id into new.editor_member_id
      from public.household_members as m
      where m.household_id = new.household_id and m.user_id = new.updated_by;
  elsif tg_op = 'UPDATE' then
    -- La clé étrangère peut effacer le compte sans effacer l’attribution au foyer.
    new.editor_member_id := old.editor_member_id;
  else
    new.editor_member_id := null;
  end if;
  return new;
end;
$$;

revoke all on function public.set_household_record_editor() from public, anon, authenticated, service_role;

create trigger household_record_editor
  before insert or update of updated_by on public.household_records
  for each row execute function public.set_household_record_editor();

revoke select on public.household_records, public.household_members from public, anon, authenticated;
grant select (
  household_id, record_id, seq, key_version, ciphertext, iv, deleted, updated_at,
  author_member_id, editor_member_id, exclusive
) on public.household_records to authenticated;
grant select (household_id, member_id, joined_at, removed_at) on public.household_members to authenticated;

drop function public.pull_records(uuid, bigint);

create function public.pull_records(h uuid, after_seq bigint)
returns table (
  household_id uuid, record_id uuid, seq bigint, key_version integer, ciphertext text, iv text,
  deleted boolean, updated_at timestamptz, author_member_id uuid, editor_member_id uuid, exclusive boolean
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_active_member(h) then
    raise insufficient_privilege using message = 'Ce foyer est indisponible.';
  end if;
  return query
    select r.household_id, r.record_id, r.seq, r.key_version, r.ciphertext, r.iv,
      r.deleted, r.updated_at, r.author_member_id, r.editor_member_id, r.exclusive
    from public.household_records as r
    where r.household_id = h and r.seq > after_seq order by r.seq limit 1000;
end;
$$;

create function public.list_my_households()
returns table (household_id uuid, key_version integer, created_at timestamptz, member_id uuid, active_member_ids uuid[])
language sql stable security definer
set search_path = ''
as $$
  select h.id, h.key_version, h.created_at, own.member_id,
    array(
      select m.member_id from public.household_members as m
      where m.household_id = h.id and m.removed_at is null
      order by m.member_id
    )
  from public.household_members as own
  join public.households as h on h.id = own.household_id
  where own.user_id = (select auth.uid()) and own.removed_at is null
  order by h.created_at, h.id;
$$;

revoke all on function public.pull_records(uuid, bigint), public.list_my_households() from public, anon, authenticated, service_role;
grant execute on function public.pull_records(uuid, bigint), public.list_my_households() to authenticated;
