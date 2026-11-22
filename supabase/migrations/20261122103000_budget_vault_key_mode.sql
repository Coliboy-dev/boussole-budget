alter table public.budget_vaults
  add column key_mode text not null default 'legacy'
    check (key_mode in ('legacy', 'managed_v1'));

comment on table public.budget_vaults is
  'Copie chiffrée du budget. Le mode de clé détermine comment le propriétaire la récupère.';

comment on column public.budget_vaults.key_mode is
  'legacy : phrase du propriétaire. managed_v1 : clé propre au compte, dérivée avec le secret serveur version 1.';
