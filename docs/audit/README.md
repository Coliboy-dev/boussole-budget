# Audit Boussole — novembre 2026

Audit complet de l'application au commit `c8abe6c` (branche `claude/boussole-budget-mvp-5haKJ`). Aucun fichier de l'application n'a été modifié.

| Fichier | Contenu |
|---|---|
| [`rapport-audit.md`](rapport-audit.md) | Rapports A à F : état des lieux, 38 anomalies, UX, fiabilité financière, vision 2.0, roadmap priorisée, conclusion. |
| [`scenarios.test.mjs`](scenarios.test.mjs) | Les 16 scénarios chiffrés exécutés contre le moteur de calcul. |
| [`captures/`](captures/) | 20 captures réelles (mobile 390 px, tablette 820 px, ordinateur 1440 px), build de production. |

Version en ligne avec graphiques : https://claude.ai/artifact/2zJWqasfwQTA9Snnh7SQ7L (privée).

## Conclusion en une phrase

Le « vrai disponible » est faux dans la plupart des situations réelles : sur la démo, l'app affiche 675,50 € alors que le montant dépensable sans rater le loyer est de 98,50 €. Le moteur de calcul doit être refait sur un modèle daté avant toute nouvelle fonctionnalité.

## Relancer les scénarios

Depuis la racine du dépôt, avec Node 22 :

```bash
TZ=Europe/Brussels node --test --experimental-strip-types --test-reporter=spec docs/audit/scenarios.test.mjs
```

Le fuseau `Europe/Brussels` est indispensable : le décalage d'un jour de la projection (FIN-06) n'apparaît pas en UTC.

Ces scénarios sont **diagnostiques**. Chacun affiche une ligne `[Sx]` avec la valeur attendue et la valeur obtenue par le code actuel ; aucun ne fait échouer la suite. Le tableau « Scénarios chiffrés » du rapport D donne l'attendu de chaque cas.

## Comment s'en servir pour la suite

1. **Chantier P0-1** : transformer chaque scénario en assertion stricte (`assert.equal(obtenu, attendu)`), ajouter un script `npm test` et une CI. La suite doit alors échouer sur le code actuel.
2. **Chantiers P0-2 et P0-3** : refaire le moteur jusqu'à ce que la suite passe. Le critère central : sur la démo au 29 mai 2026, le vrai disponible vaut **98,50 €**.
3. Ne pas modifier un attendu pour faire passer un test sans l'avoir justifié par écrit.

## Ordre d'exécution recommandé

1. P0-1, P0-4, P0-6 : tests, retrait de la démo par défaut, hygiène.
2. P0-2, P0-3, P0-5 : modèle daté, vrai disponible par point bas, export et import.
3. P1 : onboarding, écran « Aujourd'hui », échéancier, navigation, accessibilité.
4. Tests avec 5 utilisateurs réels, puis décision d'aller ou non plus loin.

Le détail, les efforts et les critères d'acceptation sont dans le rapport F.
