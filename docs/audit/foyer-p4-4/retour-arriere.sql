-- Retour arrière non destructif de 20261123003000_household_member_reads.sql.
-- Rend le schéma lisible par le client d'avant la PR #32, sans supprimer aucune donnée :
-- les colonnes author_member_id, editor_member_id et exclusive, le déclencheur et list_my_households restent en place.
-- À n'exécuter qu'après un retour arrière de l'application, et seulement si l'ancien Foyer doit refonctionner.
-- Effet assumé : les identifiants de compte redeviennent lisibles entre membres, comme sur main aujourd'hui.
begin;

grant select on public.household_records, public.household_members to authenticated;

drop function public.pull_records(uuid, bigint);
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
revoke all on function public.pull_records(uuid, bigint) from public, anon, authenticated, service_role;
grant execute on function public.pull_records(uuid, bigint) to authenticated;

commit;
