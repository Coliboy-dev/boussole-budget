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

Les 16 scénarios vérifient les résultats attendus du tableau « Scénarios chiffrés » du rapport D. La suite couvre aussi la migration, le calendrier des récurrences, les paiements et l'horizon du disponible. Chaque écart fait échouer `npm test`. GitHub Actions exécute cette commande à chaque push sur `main` et pour les pull requests qui la ciblent. S7 reste en échec jusqu'au chantier des conseils personnalisés.

S2 vérifie que le paiement du loyer laisse le disponible inchangé. Les 1 800 € du tableau correspondent au résultat du moteur actuel avant paiement. S9 et S10 fixent un jour d'ancrage pour les courses afin de vérifier la récurrence sans dépendre d'une date estimée.

Le modèle daté précise les opérations des scénarios S1, S3, S5, S11 et S13. S1 saisit le loyer comme une charge historique déjà payée, puisque le scénario ne prévoit que les courses avant la prochaine rentrée. S3 et S5 datent les flux du jour de départ. S11 teste le statut de trois échéances uniques. S13 borne ses charges de quelques centimes à la date du scénario. Les montants attendus du rapport sont conservés.

## Modèle daté et vrai disponible

Le budget v2 est enregistré en centimes entiers. La migration conserve la copie v1. Une ancienne date de récurrence sert de repère de calendrier. La migration conserve les retards identifiables sans déduire une succession de factures impayées de l'ancien repère. Les charges sans date restent consultables et le tableau de bord signale qu'elles sont hors projection.

Le disponible correspond au plus bas des soldes projetés en fin de journée sur 35 jours, moins la réserve. Les revenus incertains alimentent une estimation distincte. Sur la démo du 29 mai, le solde prudent atteint 148,50 € le 1er juin après le loyer et le transport, soit 98,50 € après réserve.

## Comment s'en servir pour la suite

1. **Chantier P0-1** met en place les assertions, le script `npm test` et la CI.
2. **Chantiers P0-2 et P0-3** introduisent le modèle daté et calculent le vrai disponible. Sur la démo au 29 mai 2026, il vaut **98,50 €**.
3. Ne pas modifier un attendu pour faire passer un test sans l'avoir justifié par écrit.

## Ordre d'exécution recommandé

1. P0-1, P0-4, P0-6 : tests, retrait de la démo par défaut, hygiène.
2. P0-2, P0-3, P0-5 : modèle daté, vrai disponible par point bas, export et import.
3. P1 : onboarding, écran « Aujourd'hui », échéancier, navigation, accessibilité.
4. Tests avec 5 utilisateurs réels, puis décision d'aller ou non plus loin.

Le détail, les efforts et les critères d'acceptation sont dans le rapport F.
