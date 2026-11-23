# Lot 4 — Budget et Analyse (Élan V3)

Captures du 29 mai 2026, budgets fictifs de `tests/browser/budget-scenarios.mjs` (ceux des Échéances, plus un scénario `depenses` avec des dépenses encodées et une enveloppe), 390 px. Avant : `main` (`1004de6`). Après : lot 4.

- **Budget** : anneau « Répartition des charges » (charges programmées ramenées au mois, famille teal), répartition du mois et rubriques aux couleurs à rôle.
- **Analyse** : anneau « Répartition des dépenses » (dépenses enregistrées du mois, famille mauve, part non encodée exclue et dite), total et lignes inchangés.

## Vérification

- `tests/browser/budget-v3.mjs` (10 tests) : pour 5 scénarios, chaque part des deux anneaux (montant et pourcentage) et leur total sont comparés au moteur (`monthlyChargesByCategory`, `analyzeMonth`). La somme des charges par catégorie est égale à `totalMonthlyExpenses`. La répartition du mois et chaque ligne de l'Analyse gardent leurs montants.
- `outils/captures-budget.mjs --comparer` : **aucun montant perdu**, signes compris, sur 10 écrans.
