# Lot 3 — Échéances (Élan V3)

Captures du 29 mai 2026 (horloge figée), budgets fictifs de `tests/browser/projection-scenarios.mjs`, horizon 35 jours, largeur 390 px. Avant : lot 1. Après : lot 3.

| Scénario | Ce qu’il montre |
| --- | --- |
| `demo` | Budget de démonstration, point bas au-dessus de la réserve, projection partielle |
| `fragile` | Solde 720 € : point bas 21 € le 1er juin, sous la réserve de 50 € |
| `negatif` | Solde 120 € : point bas −579 €, alerte « Solde négatif prévu » |
| `retard` | Loyer du 20 mai non payé : section « En retard » expliquée |
| `vide` | Budget vide : plus de statut « Fragile » ni d’alerte inventés |
| `sans-echeance` | Solde saisi, aucune échéance : illustration et texte |

## Vérification

- `tests/browser/projection-v3.mjs` : pour 7 scénarios × 4 horizons, chaque ligne (libellé, montant, date, « Montant incertain », bouton Payé), le solde final et son statut, le point bas, sa date et ses causes, la réserve, le montant manquant, le point bas si les revenus incertains arrivent, le curseur jour par jour et les étapes sont comparés à `buildProjection`. Plus Payé puis Annuler : solde, liste, projection et focus rétablis.
- `outils/captures-echeances.mjs --comparer` : tous les montants affichés avant sont encore affichés après (valeur absolue), sur 24 des 28 écrans. Les 4 écarts sont le budget vide (0,00 € et 50,00 €), voulu.

Recréer : `BOUSSOLE_TEST_URL=… node --experimental-strip-types design/capiste-signature-v3/outils/captures-echeances.mjs <dossier>` sur chaque build, puis `--comparer <avant>/montants.json <après>/montants.json`.
