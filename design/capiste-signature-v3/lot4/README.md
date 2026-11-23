# Lot 4 — Budget et Analyse (Élan V3)

Captures du 29 mai 2026, budgets fictifs de `tests/browser/budget-scenarios.mjs` (ceux des Échéances, plus un scénario `depenses` avec des dépenses encodées et une enveloppe), 390 px. Avant : `main` (`1004de6`). Après : lot 4.

- **Budget** : anneau « Répartition des charges » (charges programmées ramenées au mois), répartition du mois et rubriques aux couleurs à rôle.
- **Analyse** : anneau « Répartition des dépenses » (dépenses enregistrées du mois, part non encodée exclue et dite), total et lignes inchangés.

## Vérification

- `tests/browser/budget-v3.mjs` (10 tests) : pour 5 scénarios, chaque part des deux anneaux (montant et pourcentage) et leur total sont comparés au moteur (`monthlyChargesByCategory`, `analyzeMonth`). La somme des charges par catégorie est égale à `totalMonthlyExpenses`. La répartition du mois et chaque ligne de l'Analyse gardent leurs montants.
- `outils/captures-budget.mjs --comparer` : **aucun montant perdu**, signes compris, sur 10 écrans.

## Lot 4 bis (retours du fondateur)

- Couleurs des anneaux : quatre teintes distinctes puis gris « Autres » (voir le README de la charte).
- Barre du bas : bouton « + Dépense » au centre, sur tous les écrans ; la roue crantée en haut est retirée (Réglages est dans « Plus ») ; la tuile de l'accueil et le bouton de la page Dépenses disparaissent (doublons).
- Budget : deux vues, « Dépenses du mois » (par défaut, anneau « Où part mon argent ») et « Charges » (anneau des charges et répartition du mois), puis le menu, le quotidien en premier.
- « Frais des enfants » devient « Frais à partager » : le suivi ne retire rien du budget, l'app propose d'encoder aussi l'achat comme dépense (préremplie).
- Charges : « Courses » n'est plus proposé pour une nouvelle charge (enveloppe + dépenses) ; aides charge / dépense / dette dans les formulaires.
