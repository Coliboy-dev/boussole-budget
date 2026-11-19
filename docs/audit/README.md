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

Depuis la racine du dépôt, avec Node 22.

```bash
npm ci
npm test
```

La suite impose le fuseau `Europe/Brussels` et fige l'horloge pour chaque scénario. Le décalage d'un jour de la projection (FIN-06) n'apparaît pas en UTC.

Les 16 scénarios vérifient les résultats attendus du tableau « Scénarios chiffrés » du rapport D. Chaque écart fait échouer `npm test`. GitHub Actions exécute cette commande à chaque push sur `main` et pour les pull requests qui la ciblent. La suite échoue avec le moteur actuel.

S2 vérifie que le paiement du loyer laisse le disponible inchangé. Les 1 800 € du tableau correspondent au résultat du moteur actuel avant paiement. S9 et S10 fixent un jour d'ancrage pour les courses afin de vérifier la récurrence sans dépendre d'une date estimée.

## Comment s'en servir pour la suite

1. **Chantier P0-1** met en place les assertions, le script `npm test` et la CI.
2. **Chantiers P0-2 et P0-3** : refaire le moteur jusqu'à ce que la suite passe. Le critère central : sur la démo au 29 mai 2026, le vrai disponible vaut **98,50 €**.
3. Ne pas modifier un attendu pour faire passer un test sans l'avoir justifié par écrit.

## Ordre d'exécution recommandé

1. P0-1, P0-4, P0-6 : tests, retrait de la démo par défaut, hygiène.
2. P0-2, P0-3, P0-5 : modèle daté, vrai disponible par point bas, export et import.
3. P1 : onboarding, écran « Aujourd'hui », échéancier, navigation, accessibilité.
4. Tests avec 5 utilisateurs réels, puis décision d'aller ou non plus loin.

Le détail, les efforts et les critères d'acceptation sont dans le rapport F.
