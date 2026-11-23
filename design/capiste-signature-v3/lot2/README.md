# Lot 2 — Aujourd’hui (Élan V3)

Captures du 29 mai 2026 (horloge figée), budgets fictifs de `tests/browser/projection-scenarios.mjs`, 390 px. Avant : `main` (`b3684ae`). Après : lot 2.

## Vérification

- `tests/browser/dashboard-v3.mjs` (8 tests) compare l'accueil à `calculateBudgetSummary` et `getUpcomingReminders` sur 7 scénarios. Il vérifie :
  - le vrai disponible, sa date, le statut écrit et la phrase du point bas ;
  - « Projection partielle » ;
  - le solde et la réserve ;
  - l'alerte de risque (montant, date, causes, lien) ;
  - chaque échéance (libellé, date, montant, bouton « Payé ») et le lien des retards ;
  - la courbe.

  Il vérifie aussi que « Payé » puis « Annuler » rétablissent le solde.
- `outils/captures-accueil.mjs --comparer` : **aucun montant perdu**, signes compris, sur les 8 écrans.
