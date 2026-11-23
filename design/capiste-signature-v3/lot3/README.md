# Lot 3 — Échéances (Élan V3)

Captures du 29 mai 2026 (horloge figée), budgets fictifs de `tests/browser/projection-scenarios.mjs`, horizon 35 jours, largeur 390 px. Avant : lot 1. Après : lot 3.

| Scénario | Ce qu’il montre |
| --- | --- |
| `demo` | 16 échéances sur 35 jours, groupées par jour, montants signés, projection partielle |
| `fragile` | Solde 720 € : point bas 21 € le 1er juin, sous la réserve de 50 € ; simulation proposée avant un achat |
| `negatif` | Solde 120 € : point bas −579 €, alerte « Solde négatif prévu », vérifier charges et revenus attendus |
| `negatif-retard` | Même cas avec le loyer du 20 mai non payé : l’alerte renvoie d’abord vers les retards |
| `vide` | Budget vide : plus de statut « Fragile » ni d’alerte inventés |
| `sans-echeance` | Solde saisi, aucune échéance : illustration et texte |

## Vérification

- `tests/browser/projection-v3.mjs` : pour 8 scénarios × 4 horizons, chaque ligne (libellé, **montant signé exact**, groupe du jour, « Montant incertain », bouton Payé), l’ordre des jours, le solde final et son statut, le point bas, sa date et ses causes, la réserve, le montant manquant, le point bas si les revenus incertains arrivent, les liens de l’alerte, le curseur jour par jour et les étapes sont comparés à `buildProjection`. Plus Payé puis Annuler : solde, liste, projection et focus rétablis.
- Mutation : avec `Math.abs` remis dans la liste, 6 scénarios sur 8 échouent (« Transport (STIB) affiché -49,00 € »). Les 2 autres n’ont aucune sortie.
- `outils/captures-echeances.mjs --comparer` : tous les montants affichés avant, **signe compris**, sont encore affichés après sur 28 des 32 écrans. Les 4 écarts sont le budget vide (0,00 € et 50,00 €), voulu.

Recréer : `BOUSSOLE_TEST_URL=… node --experimental-strip-types design/capiste-signature-v3/outils/captures-echeances.mjs <dossier>` sur chaque build, puis `--comparer <avant>/montants.json <après>/montants.json`.
