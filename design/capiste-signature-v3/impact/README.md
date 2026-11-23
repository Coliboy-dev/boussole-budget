# Lot 1 — mesure d’impact

Le lot 1 **ajoute** les couleurs à rôle d’Élan V3 dans `app/globals.css` (`--cap-*`, utilitaires Tailwind `bg-cap-surface`, `text-cap-text-muted`…). Aucun composant ne les utilise encore.

## Preuves

- **Aucun changement visible :** 18 captures (9 écrans × 390 et 1 280 px, budget de démonstration du 29 mai 2026) sont identiques au pixel près entre `main` et le lot 1.
- **Aucun changement de contenu :** texte affiché, montants, dates, statuts, avertissements, rôles et noms des actions, alertes et messages d’état comparés écran par écran : identiques.

## Généralisation proposée, non appliquée

`generalisation.css` montre ce que donnerait le remplacement global des teintes Tailwind par la palette Élan V3 (fond ivoire, texte bleu nuit, teal `#076E68`, avertissements et erreurs adoucis), sans toucher aux composants. Chaque remplacement garde un contraste texte ≥ 4,5:1.

Constat : le changement de palette seul est **discret**. L’effet « premium » de la maquette vient surtout de la mise en page des lots 2 à 5 (carte du vrai disponible en dégradé, donut, illustrations, hiérarchie). Les couleurs à rôle seront donc adoptées écran par écran, au moment de leur refonte, plutôt que par un remplacement global.

## Refaire la mesure

```bash
# Build et lancement de l’application, puis :
BOUSSOLE_TEST_URL=http://localhost:3100 node --experimental-strip-types \
  design/capiste-signature-v3/outils/captures-impact.mjs /tmp/avant
BOUSSOLE_TEST_URL=http://localhost:3100 node --experimental-strip-types \
  design/capiste-signature-v3/outils/captures-impact.mjs /tmp/apres design/capiste-signature-v3/impact/generalisation.css
```

Chaque dossier contient les captures et `contenu.json` (texte, actions, alertes) à comparer.
