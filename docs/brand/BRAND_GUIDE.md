# CAPISTE — Direction artistique & Asset Kit V1

Date : 22 novembre 2026. Référence graphique : **Capiste Élan V2**, maquette autonome validée.  
Périmètre : **assets graphiques uniquement**, aucun code, dépôt, base de données ou paramètre de production modifié.

## Intention et principes

**Une direction plus claire.** Capiste aide à comprendre et anticiper son budget, sans jugement, promesse implicite ou sensation de luxe ostentatoire. Design : contemporain, accueillant, lisible, jamais sensationnaliste.

Le symbole de marque propose un **C ouvert** entourant une **aiguille directionnelle**. Il n’illustre pas un état du budget : il est constant dans toutes les situations.

## Palette (référence unique)

| Jeton | Valeur | Usage |
| --- | --- | --- |
| `teal-600` | `#087F78` | Marque, surfaces d’action principales, pictogramme |
| `navy-900` | `#172C37` | Texte principal, fond sombre |
| `purple-500` | `#8274D8` | Accent secondaire, illustrations, éléments non critiques |
| `mint-100` | `#DDF1ED` | Surfaces de soutien, halos très doux |
| `ivory-50` | `#F5F3EE` | Arrière-plan général chaleureux |
| `amber-400` | `#E6AB51` | Accent discret; **jamais** seul pour signaler une alerte |
| `teal-text` | `#076E68` | Texte vert sur ivoire, pour contraste amélioré |
| `purple-text` | `#6758AC` | Texte mauve sur fond clair, pour contraste amélioré |

## Lisibilité / accessibilité

| Combinaison | Contraste | Usage recommandé |
| --- | ---: | --- |
| Bleu nuit sur ivoire | 13.04:1 | Texte normal : OK |
| Blanc sur vert profond | 4.86:1 | Bouton primaire : OK pour texte normal |
| Vert profond sur blanc | 4.86:1 | Texte normal : OK |
| Vert profond sur ivoire | 4.39:1 | **Insuffisant** pour texte normal AA : utiliser `teal-text` |
| `teal-text` sur ivoire | 5.51:1 | Texte normal : OK |
| Mauve sur blanc | 3.86:1 | **Insuffisant** pour texte normal AA : utiliser `purple-text` |
| `purple-text` sur blanc | 5.89:1 | Texte normal : OK |
| Ambre sur blanc | 2.04:1 | **Non** pour texte ou signal critique |
| Menthe sur bleu nuit | 12.31:1 | Texte / pictogramme : OK |

Ne pas utiliser la couleur comme unique indicateur de statut. Pour toute dépense, alerte, projection partielle ou absence de données, joindre une **mention explicite lisible** et, lorsque nécessaire, une icône et une information contextuelle. Fournir des contrastes de focus visibles et des états interactifs non ambigus. Les règles valables en production doivent être testées avec les vrais composants.

## Typographie

- **Corps de l’interface** : Inter (existant), régulier / 500 / 600.
- **Titres / chiffres-signature** : Plus Jakarta Sans (existant), 700 / 800.
- **Logo** : tracé vectoriel inspiré des proportions d’Inter Bold, indépendant des polices installées. La ponctuation finale est intégrée comme cercle ambre.
- Aucune police intégrée ni chargement distant dans les SVG et PNG fournis.

## Dossiers et usages

```text
capiste-brand-v1/
  logos/
    logo-capiste.svg                    # logo couleur, alias principal
    logo-capiste-color.svg
    logo-capiste-mono-dark.svg          # sur surfaces claires
    logo-capiste-mono-light.svg         # sur surfaces foncées
  icons/
    app-icon.svg
    app-icon-180.png                    # Apple touch icon
    app-icon-192.png                    # PWA any
    app-icon-512.png                    # PWA any
    app-icon-1024.png                   # export haute définition
    app-icon-maskable.svg
    app-icon-maskable-192.png
    app-icon-maskable-512.png
    favicon.svg
    favicon-32.png / favicon-48.png / favicon-64.png
  illustrations/
    empty-revenus.svg + empty-revenus-dark.svg
    empty-budget.svg + empty-budget-dark.svg
    empty-objectifs.svg + empty-objectifs-dark.svg
    projection-incomplete.svg + projection-incomplete-dark.svg
    empty-depenses.svg + empty-depenses-dark.svg
    progression.svg + progression-dark.svg
    security-backup.svg + security-backup-dark.svg
  preview/
    index.html                          # galerie autonome locale
    capiste-asset-board-v1.png
    capiste-dark-variants-v1.png
    [miniatures PNG des illustrations et logos]
  reference/
    BRAND_GUIDE.md
    tokens.css
    asset-manifest.json
```

## Tailles et espaces

- **Illustrations** : `viewBox="0 0 360 260"`, ratio 18:13. À afficher idéalement **180–280 px de large** sur mobile ; jusqu’à 340 px sur desktop. Conserver le ratio, `object-fit: contain`.
- **Zone de composition** : la majorité du sujet se situe dans le rectangle x = 55–300 et y = 38–220, halo et petites touches inclus. Éviter les crops.
- **Icône de marque** : conçue pour tenir en 32 px ou plus, y compris sur barre de navigation. En dessous, privilégier la variante favicon. Espace libre minimal autour du logo complet : **12 px** (mobile) ; 16 px (desktop).
- **PWA** : les fichiers `app-icon-192.png` et `app-icon-512.png` ont une surface couleur à coins arrondis (`purpose: any`). Les fichiers `app-icon-maskable-*` ont un arrière-plan opaque jusqu’aux quatre bords, et placent le symbole significatif dans le cercle central sûr (~80 % de diamètre) pour supporter les recadrages système.
- **Favicon** : utiliser `favicon.svg` ; `favicon-32.png` en repli.
- **Fond clair** : variantes sans suffixe sur `#FFFFFF` ou `#F5F3EE`.
- **Fond sombre** : fichiers suffixés `-dark.svg` sur `#172C37` ou une carte sombre proche ; les ombres deviennent très légères et les bordures sont éclaircies.

## Règles d’usage métier (impératives)

1. Une illustration n’est **jamais une preuve** d’un statut financier, d’un paiement, d’une réussite ni d’une projection complète.
2. `empty-budget.svg` : afficher la mention explicite « Budget à configurer » ; **ne pas** afficher « tout va bien », « finances saines » ou un état vert rassurant sans données.
3. `projection-incomplete.svg` : afficher « Projection partielle » ou « Projection à compléter », avec explication des dates ou données manquantes ; ne pas représenter un graphique validé.
4. `empty-revenus.svg` : lorsqu’aucun revenu n’est saisi, afficher « Aucun revenu renseigné », sans inférer un revenu nul réel.
5. `empty-depenses.svg` : distinguer « Aucune dépense enregistrée » d’« aucune dépense effectuée ».
6. `progression.svg` : montrer uniquement après validation réelle du succès / objectif ; n’utiliser ni données de démonstration, ni métrique fictive.
7. Aucun dessin d’asset ne contient d’euros, dates, pourcentages, données de client, texte visible ou valeurs.
8. Les **jauges, donuts, courbes, barres et progressions** doivent être générés par les composants applicatifs à partir du moteur réel ; ces SVG décoratifs ne les remplacent pas.

## Vérifications avant intégration (proposées, pas exécutées sur la production)

- Vérifier couleurs et contraste **sur les composants réels** (y compris hover, focus, disabled, danger).
- Tester les icônes PWA sur Android (recadrage maskable), iOS (Apple touch icon) et ordinateur.
- Tester l’apparence light/dark avec les fonds de carte réels, en basse luminosité et avec zoom 200%.
- Vérifier les textes traduisibles et la sémantique : SVG décoratif `aria-hidden="true"`, illustration informative `role="img"` avec libellé contextualisé ; pas de double lecture.
- Ne pas modifier les montants, les dates, les échéances, les états de paiement ou le moteur de calcul au moment de l’intégration.

## Limites du kit

- Ce dossier est une **proposition de direction artistique matérialisée en assets**, alignée sur le langage visuel d’Élan V2. Il ne contient **ni refonte du code**, ni manifest PWA déployé, ni validation sur iPhone/Android physique.
- Les assets sont entièrement statiques, autoportants et librement redimensionnables.
