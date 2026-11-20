-- Coffre chiffré de chaque compte : le serveur ne reçoit qu'un bloc chiffré sur l'appareil
-- (AES-GCM, clé dérivée d'une phrase secrète par PBKDF2). Aucun montant n'est lisible ici.

create table public.budget_vaults (
  user_id uuid primary key references auth.users (id) on delete cascade,
  version integer not null default 1 check (version > 0),
  ciphertext text not null check (char_length(ciphertext) between 16 and 4000000),
  iv text not null check (char_length(iv) between 8 and 64),
  salt text not null check (char_length(salt) between 8 and 128),
  kdf_iterations integer not null check (kdf_iterations between 100000 and 10000000),
  updated_at timestamptz not null default now()
);

comment on table public.budget_vaults is
  'Budget Boussole chiffré sur l''appareil. Le serveur ne peut pas le déchiffrer.';

-- L'heure de mise à jour est fixée par le serveur, jamais par l'appareil.
create function public.touch_budget_vault() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger budget_vaults_touch
  before insert or update on public.budget_vaults
  for each row execute function public.touch_budget_vault();

alter table public.budget_vaults enable row level security;

revoke all on public.budget_vaults from anon, authenticated;
grant select, insert, update, delete on public.budget_vaults to authenticated;

create policy "Lire son coffre" on public.budget_vaults
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "Créer son coffre" on public.budget_vaults
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "Modifier son coffre" on public.budget_vaults
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Supprimer son coffre" on public.budget_vaults
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Droit à l'effacement : supprime le compte et, en cascade, son coffre.
create function public.delete_my_account() returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
revoke all on function public.touch_budget_vault() from public, anon, authenticated;
