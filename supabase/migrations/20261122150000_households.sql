create table public.households (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  key_version integer not null default 1 check (key_version > 0),
  last_seq bigint not null default 0
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  member_id uuid not null default gen_random_uuid(),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (household_id, user_id),
  unique (household_id, member_id)
);
create index household_members_user on public.household_members (user_id);

create table public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz
);
create index household_invitations_household on public.household_invitations (household_id);

create table public.household_records (
  household_id uuid not null references public.households (id) on delete cascade,
  record_id uuid not null,
  seq bigint not null,
  key_version integer not null,
  ciphertext text not null check (char_length(ciphertext) between 16 and 200000),
  iv text not null check (char_length(iv) between 8 and 64),
  deleted boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (household_id, record_id)
);
create index household_records_seq on public.household_records (household_id, seq);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invitations enable row level security;
alter table public.household_records enable row level security;

revoke all on public.households, public.household_members, public.household_invitations, public.household_records
  from public, anon, authenticated;
grant select on public.households, public.household_members, public.household_records to authenticated;

create function public.is_active_member(h uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members as m
    where m.household_id = h and m.user_id = (select auth.uid()) and m.removed_at is null
  );
$$;

create policy "Lire ses foyers" on public.households
  for select to authenticated using (public.is_active_member(id));
create policy "Lire les adhésions de ses foyers" on public.household_members
  for select to authenticated using (public.is_active_member(household_id));
create policy "Lire les éléments de ses foyers" on public.household_records
  for select to authenticated using (public.is_active_member(household_id));

-- Prendre le verrou avant de vérifier l’adhésion sérialise les écritures et le retrait d’accès.
create function public.lock_active_household(h uuid) returns public.households
language plpgsql
set search_path = ''
as $$
declare
  locked_household public.households;
begin
  select * into locked_household from public.households where id = h for update;
  if not found or not public.is_active_member(h) then
    raise insufficient_privilege using message = 'Ce foyer est indisponible.';
  end if;
  return locked_household;
end;
$$;

create function public.create_household() returns table(household_id uuid, member_id uuid)
language plpgsql security definer
set search_path = ''
as $$
declare
  h uuid;
  caller uuid := auth.uid();
begin
  if caller is null then
    raise insufficient_privilege using message = 'Connecte-toi pour créer un foyer.';
  end if;
  insert into public.households default values returning id into h;
  return query
    insert into public.household_members as m (household_id, user_id) values (h, caller)
    returning m.household_id, m.member_id;
end;
$$;

create function public.create_invitation(h uuid, token_hash text) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  new_invitation uuid;
begin
  perform public.lock_active_household(h);
  if (
    select count(*) from public.household_members as m where m.household_id = h and m.removed_at is null
  ) >= 2 then
    raise invalid_parameter_value using message = 'Ce foyer a déjà deux membres.';
  end if;
  delete from public.household_invitations as i where i.household_id = h and i.used_at is null;
  insert into public.household_invitations (household_id, token_hash, created_by)
    values (h, token_hash, auth.uid()) returning id into new_invitation;
  return new_invitation;
end;
$$;

create function public.revoke_invitation(h uuid, invitation uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.lock_active_household(h);
  delete from public.household_invitations as i
    where i.household_id = h and i.id = invitation and i.used_at is null;
end;
$$;

create function public.accept_invitation(invitation uuid, token text) returns table(household_id uuid, member_id uuid)
language plpgsql security definer
set search_path = ''
as $$
declare
  h uuid;
  caller uuid := auth.uid();
  matched public.household_invitations;
  invalid_invitation constant text := 'Cette invitation n’est plus valable.';
begin
  if caller is null or token is null or token !~ '^[A-Za-z0-9_-]{43}$' then
    raise invalid_parameter_value using message = invalid_invitation;
  end if;

  select i.household_id into h from public.household_invitations as i where i.id = invitation;
  perform 1 from public.households where id = h for update;
  if not found then
    raise invalid_parameter_value using message = invalid_invitation;
  end if;

  -- Relire après le verrou pour voir une annulation, un retrait ou une acceptation concurrente.
  select i.* into matched
  from public.household_invitations as i
  where i.id = invitation
    and i.used_at is null
    and i.expires_at > clock_timestamp()
    and i.token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex')
    and exists (
      select 1 from public.household_members as m
      where m.household_id = h and m.user_id = i.created_by and m.removed_at is null
    );
  if not found or public.is_active_member(h) or (
    select count(*) from public.household_members as m where m.household_id = h and m.removed_at is null
  ) >= 2 then
    raise invalid_parameter_value using message = invalid_invitation;
  end if;

  return query
    insert into public.household_members as m (household_id, user_id) values (h, caller)
    on conflict on constraint household_members_pkey do update set removed_at = null, joined_at = now()
    returning m.household_id, m.member_id;
  update public.household_invitations as i set used_at = now() where i.id = matched.id;
end;
$$;

create function public.upsert_records(h uuid, records jsonb) returns table(record_id uuid, seq bigint)
language plpgsql security definer
set search_path = ''
as $$
declare
  locked_household public.households;
  next_seq bigint;
  entry record;
  caller uuid := auth.uid();
begin
  locked_household := public.lock_active_household(h);
  if jsonb_typeof(records) is distinct from 'array' or jsonb_array_length(records) > 500 then
    raise invalid_parameter_value using message = 'Le lot d’éléments du foyer est invalide.';
  end if;
  next_seq := locked_household.last_seq;

  for entry in
    select parsed.*
    from jsonb_array_elements(records) with ordinality as item(value, position)
    cross join lateral jsonb_to_record(item.value) as parsed(
      record_id uuid, key_version integer, ciphertext text, iv text, deleted boolean
    )
    order by item.position
  loop
    if entry.key_version is distinct from locked_household.key_version then
      raise invalid_parameter_value using message = 'La version de la clé du foyer a changé.';
    end if;
    next_seq := next_seq + 1;
    return query
      insert into public.household_records as r
        (household_id, record_id, seq, key_version, ciphertext, iv, deleted, created_by, updated_by)
      values
        (h, entry.record_id, next_seq, entry.key_version, entry.ciphertext, entry.iv, entry.deleted, caller, caller)
      on conflict on constraint household_records_pkey do update set
        seq = excluded.seq,
        key_version = excluded.key_version,
        ciphertext = excluded.ciphertext,
        iv = excluded.iv,
        deleted = excluded.deleted,
        updated_by = excluded.updated_by,
        updated_at = now()
      returning r.record_id, r.seq;
  end loop;

  update public.households set last_seq = next_seq where id = h;
end;
$$;

create function public.pull_records(h uuid, after_seq bigint) returns setof public.household_records
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_active_member(h) then
    raise insufficient_privilege using message = 'Ce foyer est indisponible.';
  end if;
  return query
    select r.* from public.household_records as r
    where r.household_id = h and r.seq > after_seq order by r.seq limit 1000;
end;
$$;

create function public.leave_household(h uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.lock_active_household(h);
  update public.household_members as m set removed_at = now()
    where m.household_id = h and m.user_id = auth.uid() and m.removed_at is null;
end;
$$;

create function public.stop_sharing_with(h uuid, other_member uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.lock_active_household(h);
  update public.household_members as m set removed_at = now()
    where m.household_id = h and m.member_id = other_member
      and m.user_id <> auth.uid() and m.removed_at is null;
end;
$$;

create function public.prune_household_after_membership() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  profile_id_bytes bytea;
begin
  if tg_op = 'UPDATE' and new.removed_at is null then
    return null;
  end if;

  perform 1 from public.households where id = old.household_id for update;
  if not found then
    return null;
  end if;

  if not exists (
    select 1 from public.household_members as m where m.household_id = old.household_id and m.removed_at is null
  ) then
    delete from public.households where id = old.household_id;
  elsif tg_op = 'DELETE' then
    -- Même UUID dérivé que derivedRecordId(householdId, 'member|' + memberId).
    profile_id_bytes := substring(sha256(convert_to(old.household_id || '|member|' || old.member_id, 'UTF8')), 1, 16);
    profile_id_bytes := set_byte(profile_id_bytes, 6, (get_byte(profile_id_bytes, 6) & 15) | 80);
    profile_id_bytes := set_byte(profile_id_bytes, 8, (get_byte(profile_id_bytes, 8) & 63) | 128);
    delete from public.household_records as r
      where r.household_id = old.household_id and r.record_id = encode(profile_id_bytes, 'hex')::uuid;
  end if;
  return null;
end;
$$;

create trigger household_members_prune
  after update of removed_at or delete on public.household_members
  for each row execute function public.prune_household_after_membership();

create or replace function public.delete_my_account() returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Connexion requise.';
  end if;

  perform 1
  from public.households as h
  join public.household_members as m on m.household_id = h.id
  where m.user_id = caller
  order by h.id
  for update of h;

  delete from auth.users where id = caller;
end;
$$;

revoke all on function public.lock_active_household(uuid), public.prune_household_after_membership()
  from public, anon, authenticated;

revoke all on function public.is_active_member(uuid), public.create_household(),
  public.create_invitation(uuid, text), public.revoke_invitation(uuid, uuid), public.accept_invitation(uuid, text),
  public.upsert_records(uuid, jsonb), public.pull_records(uuid, bigint),
  public.leave_household(uuid), public.stop_sharing_with(uuid, uuid), public.delete_my_account()
  from public, anon, authenticated;

grant execute on function public.is_active_member(uuid), public.create_household(),
  public.create_invitation(uuid, text), public.revoke_invitation(uuid, uuid), public.accept_invitation(uuid, text),
  public.upsert_records(uuid, jsonb), public.pull_records(uuid, bigint),
  public.leave_household(uuid), public.stop_sharing_with(uuid, uuid), public.delete_my_account()
  to authenticated;
