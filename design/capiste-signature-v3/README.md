# Capiste — Élan Signature V3 (lot 0)

Kit de la refonte graphique, **sans aucun écran de l’app modifié**. Ouvrir `apercu.html` dans un navigateur pour tout voir sur une page.

| Élément | Fichier |
| --- | --- |
| Couleurs à rôle, thème clair | `tokens.json` |
| Contrastes WCAG 2.2 AA | `contrastes.md`, généré par `node design/capiste-signature-v3/outils/contrastes.mjs` (échoue si un contraste passe sous le seuil) |
| Illustrations | `illustrations/*-720.webp` (écrans de téléphone) et `*-1080.webp` (écrans haute densité et ordinateur) |
| Page d’aperçu autonome | `apercu.html` |
| Logo | `logo/`, apporté par la PR #31 |

## Règles

- **Une couleur, un rôle.** Les composants utilisent les noms (`text-muted`, `primary-text`…), jamais une teinte. Le thème sombre réutilisera les mêmes noms.
- **Texte teal ou mauve :** uniquement les variantes `-text`. `primary` (#087F78) et `secondary` (#8274D8) ne passent pas 4,5:1 sur ivoire ou blanc.
- **Ambre :** décoratif, jamais seul pour signaler un risque.
- **Graphiques :** quatre teintes bien distinctes dans un ordre fixe (teal `#00897B`, ambre `#E69500`, violet `#5B4FD6`, rose `#E0457B`), puis gris `#AAB2BB` pour « Autres ». Les nuances d'une même famille ne se distinguaient pas à l'œil (retour du fondateur) : c'est le titre du graphique qui dit s'il s'agit de charges ou de dépenses, pas la couleur. Chaque part a son libellé, son montant et sa part. Palette validée (écart normal ≥ 22, daltonisme ≥ 7,4 avec légende obligatoire).
- **Illustrations :** fond ivoire intégré, toujours dans un cadre ivoire arrondi (`#FEF5F1`), `alt=""` car décoratives, à côté d’un texte qui dit l’état réel. Jamais comme preuve d’un état financier ni de progrès.
- **Mouvement :** 180 à 320 ms, seulement pour guider ; rien si `prefers-reduced-motion: reduce`.

## Illustrations

Générées avec ChatGPT Images à partir de la direction Élan V3 (sources PNG 1448 × 1086 conservées hors dépôt). Correspondance prévue :

| Fichier | Écran vide |
| --- | --- |
| `revenus-portefeuille` | Revenus : « Aucun revenu renseigné » |
| `echeances-calendrier` | Échéances : aucune échéance à venir |
| `objectifs-cible` | Objectifs : « Aucun objectif défini » |
| `budget-enveloppes` | Enveloppes : aucune enveloppe |
| `depenses-mensuelles` | Dépenses : « Aucune dépense enregistrée » |
| `projection-a-completer` | « Projection à compléter » (charges sans date) |
| `epargne-tirelire` | Objectifs, en-tête de section (pas une preuve de progrès) |
| `foyer-partage` | Foyer, après les PR 4 et 5 du plan P4 |
