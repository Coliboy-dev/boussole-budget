alter table public.household_records
  add column author_member_id uuid,
  add column exclusive boolean not null default false,
  add constraint household_records_exclusive_author_check check (not exclusive or author_member_id is not null);

comment on column public.household_records.author_member_id is
  'Identifiant du membre fixé à la création. Il est conservé après la suppression du compte pour attribuer les écritures du foyer.';

create or replace function public.upsert_records(h uuid, records jsonb) returns table(record_id uuid, seq bigint)
language plpgsql security definer
set search_path = ''
as $$
declare
  locked_household public.households;
  next_seq bigint;
  entry record;
  receipt public.household_writes;
  caller uuid := auth.uid();
  caller_member_id uuid;
begin
  locked_household := public.lock_active_household(h);
  if jsonb_typeof(records) is distinct from 'array' or jsonb_array_length(records) > 500 then
    raise invalid_parameter_value using message = 'Le lot d’éléments du foyer est invalide.';
  end if;

  select m.member_id into caller_member_id
    from public.household_members as m
    where m.household_id = h and m.user_id = caller and m.removed_at is null;
  if not found then
    raise insufficient_privilege using message = 'Ce foyer est indisponible.';
  end if;
  next_seq := locked_household.last_seq;

  for entry in
    select parsed.*
    from jsonb_array_elements(records) with ordinality as item(value, position)
    cross join lateral jsonb_to_record(item.value) as parsed(
      write_id uuid, record_id uuid, key_version integer, ciphertext text, iv text, deleted boolean, exclusive boolean
    )
    order by item.position
  loop
    if entry.write_id is null or entry.record_id is null then
      raise invalid_parameter_value using message = 'L’identifiant de l’écriture du foyer est invalide.';
    end if;

    if exists (
      select 1 from public.household_records as r
        where r.household_id = h and r.record_id = entry.record_id and r.exclusive
          and r.author_member_id is distinct from caller_member_id
    ) then
      raise insufficient_privilege using message = 'Seul le membre qui a créé cet élément peut le modifier.';
    end if;

    select w.* into receipt from public.household_writes as w
      where w.household_id = h and w.write_id = entry.write_id;
    if found then
      if receipt.record_id <> entry.record_id then
        raise invalid_parameter_value using message = 'Cet identifiant d’écriture appartient à un autre élément.';
      end if;
      return query select receipt.record_id, receipt.seq;
      continue;
    end if;

    if entry.key_version is distinct from locked_household.key_version then
      raise invalid_parameter_value using message = 'La version de la clé du foyer a changé.';
    end if;
    next_seq := next_seq + 1;
    return query
      insert into public.household_records as r (
        household_id, record_id, seq, key_version, ciphertext, iv, deleted,
        created_by, updated_by, author_member_id, exclusive
      )
      values (
        h, entry.record_id, next_seq, entry.key_version, entry.ciphertext, entry.iv, entry.deleted,
        caller, caller, caller_member_id, coalesce(entry.exclusive, false)
      )
      on conflict on constraint household_records_pkey do update set
        seq = excluded.seq,
        key_version = excluded.key_version,
        ciphertext = excluded.ciphertext,
        iv = excluded.iv,
        deleted = excluded.deleted,
        updated_by = excluded.updated_by,
        updated_at = now()
      returning r.record_id, r.seq;

    insert into public.household_writes (household_id, write_id, record_id, seq)
      values (h, entry.write_id, entry.record_id, next_seq);
  end loop;

  if next_seq <> locked_household.last_seq then
    update public.households set last_seq = next_seq where id = h;
  end if;
end;
$$;
