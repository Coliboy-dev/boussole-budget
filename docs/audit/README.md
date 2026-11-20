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

Les 16 scénarios vérifient les résultats attendus du tableau « Scénarios chiffrés » du rapport D. La suite couvre aussi la migration, le calendrier des récurrences, les paiements, l'horizon du disponible et le budget initial vide. Chaque écart fait échouer `npm test`. GitHub Actions exécute cette commande à chaque push sur `main` et pour les pull requests qui la ciblent.

S2 vérifie que le paiement du loyer laisse le disponible inchangé. Les 1 800 € du tableau correspondent au résultat du moteur actuel avant paiement. S9 et S10 fixent un jour d'ancrage pour les courses afin de vérifier la récurrence sans dépendre d'une date estimée.

Le modèle daté précise les opérations des scénarios S1, S3, S5, S11 et S13. S1 saisit le loyer comme une charge historique déjà payée, puisque le scénario ne prévoit que les courses avant la prochaine rentrée. S3 et S5 datent les flux du jour de départ. S11 teste le statut de trois échéances uniques. S13 borne ses charges de quelques centimes à la date du scénario. Les montants attendus du rapport sont conservés.

## Modèle daté et vrai disponible

Le budget v2 est enregistré en centimes entiers. La migration conserve la copie v1. Une ancienne date de récurrence sert de repère de calendrier. La migration conserve les retards identifiables sans déduire une succession de factures impayées de l'ancien repère. Les charges sans date restent consultables et le tableau de bord signale qu'elles sont hors projection.

Le disponible correspond au plus bas des soldes projetés en fin de journée sur 35 jours, moins la réserve. Les revenus incertains alimentent une estimation distincte. Sur la démo du 29 mai, le solde prudent atteint 148,50 € le 1er juin après le loyer et le transport, soit 98,50 € après réserve.

## Simulateur d’achat et charges annuelles

Depuis **Aujourd’hui** ou **Budget**, **Simuler un achat** teste une dépense à une date comprise dans la projection de 35 jours. Le montant est déduit à partir de cette date. Le résultat affiche le nouveau point bas et la marge après réserve et provisions. L’achat simulé ne change pas le budget enregistré.

Une charge récurrente annuelle et datée réserve un douzième de son montant dans le vrai disponible lorsque sa prochaine échéance impayée se trouve après l’horizon. Une taxe de 300 € prévue en mars réserve ainsi 25 € sur une projection qui s’arrête en décembre. Si la facture tombe dans l’horizon, son montant complet figure dans la projection. La mensualisation de la charge reste comprise dans le total mensuel des charges.

## Première ouverture et conseils

Un nouveau navigateur propose trois questions sur le solde bancaire, la prochaine rentrée certaine et les factures à payer. Le solde et les échéances saisies sont enregistrés ensemble, puis le premier vrai disponible s’affiche avec le détail du calcul. Le revenu et les factures saisis sont ponctuels. Un budget déjà enregistré ou restauré ouvre directement le tableau de bord. La démo en lecture seule et la restauration sont accessibles dès le premier écran.

Les conseils utilisent les données du budget. Les pages de médiation et de documents sont masquées jusqu'à leur implémentation.

## Écran Aujourd’hui

Le premier écran du budget affiche le vrai disponible, la date de fin de la projection et l’explication du point bas. Le même bloc contient le solde bancaire, modifiable sur place, et la réserve de sécurité, qui ouvre son réglage. Il présente ensuite les trois prochaines échéances avec un bouton **Payé**, qui débite le solde et propose **Annuler**, et indique le nombre de retards. La courbe montre le solde prudent en fin de journée sur le même horizon. Le curseur permet de lire le solde à une date précise.

## Échéancier

L’échéancier réunit les charges, les dettes et les rentrées prévues dans la page **Échéancier**. Les échéances en retard sont regroupées en haut. Un appui sur **Payé** enregistre l’échéance et débite le solde. Le vrai disponible est recalculé. **Annuler** rétablit le dernier paiement effectué sur cette page tant que le budget reste inchangé. Si le paiement est déjà déduit de ton solde, enregistre-le depuis **Charges** ou **Dettes** en cochant la case correspondante.

Les quatre onglets sont **Aujourd’hui**, **Échéances**, **Budget** et **Plus**. Dans **Plus → Réglages**, tu peux changer ton prénom et ta réserve, ouvrir la démo en lecture seule ou effacer le budget de cet appareil. L’écran **Aujourd’hui** donne aussi accès au réglage de la réserve.

## Accessibilité

Le premier lien au clavier donne accès au contenu. Les fenêtres de saisie gardent le focus dans la modale, se ferment avec Échap et rendent le focus à leur bouton d’ouverture. Les actions principales ont une cible d’au moins 44 pixels. Les contrôles axe-core WCAG 2.0 à 2.2 A/AA ont signalé zéro violation dans Chromium à 390 × 667 sur les pages du budget, les formulaires en modale et les trois étapes du premier budget.

## Remboursement des dettes

La page **Dettes** affiche le restant dû et, quand le calendrier le permet, la date de fin estimée au rythme des paiements prévus. La dernière mensualité est limitée au restant dû. Pour une dette sans échéance ouverte, tu peux saisir directement le montant payé. Le paiement diminue le restant dû et le solde, sauf quand tu indiques que le paiement est déjà déduit du solde.

## Application installable

Utilise le build de production sur HTTPS, ou sur localhost pour un test. Ouvre l’application en ligne jusqu’à ce que **Plus** affiche **Mode hors ligne prêt**. Le cache garde les pages et les ressources de cette version. Le budget reste dans le stockage local. Le parcours hors ligne a été vérifié dans Chromium avec un profil mobile Android. L’installation sur les téléphones du pilote reste à vérifier.

Dans **Plus → Réglages**, utilise **Demander le stockage persistant** pour solliciter la protection du navigateur contre l’effacement automatique. L’écran affiche le résultat. La décision dépend du navigateur. Garde une copie JSON dans les fichiers de ton appareil.

Les pages **Confidentialité** et **Mentions légales** sont accessibles dans **Plus**. La confidentialité décrit le traitement des données techniques par Vercel. Les mentions légales indiquent la dénomination, l’adresse, l’e-mail, le numéro d’entreprise (BCE) et le numéro de TVA de Start’OnLab.

Les pages et les ressources HTTP portent la directive `noindex`. Le fichier `robots.txt` laisse les moteurs consulter les URL pour qu’ils puissent lire cette directive et retirer les URL déjà indexées. [Documentation Google sur la désindexation](https://developers.google.com/search/docs/crawling-indexing/block-indexing)

## Sauvegarde du budget

Dans **Sauvegarde**, le bouton de téléchargement crée un fichier JSON v2 qui contient le budget complet en centimes. Pour le restaurer, choisis le fichier puis confirme le remplacement du budget sur cet appareil.

**Aujourd’hui** affiche la date du dernier téléchargement JSON lancé pour le budget depuis cet appareil. Un rappel s’affiche dès la première sauvegarde à faire, puis à partir de sept jours après le dernier export. Un import ou un effacement remet la date à zéro. Le rappel est affiché dans l’application.

Le même schéma contrôle le fichier et le stockage du navigateur. Une version incompatible, une date invalide ou une dette avec un montant négatif est signalée. L'application charge les données avant de les écrire et ne remplace le budget actif qu'après l'enregistrement réussi de l'import. La migration automatique d'un ancien budget conserve la copie v1.

## Hygiène technique et formulaires

Next.js et sa configuration ESLint utilisent la version 16.4.6. La politique de sécurité du contenu (CSP) donne un nonce distinct aux scripts de chaque page. Les pages sont rendues à la demande pour que ce nonce corresponde à la réponse HTTP. L'évaluation dynamique des scripts est permise en développement pour le rechargement à chaud. Les barres de progression utilisent des styles en ligne.

Le tableau de bord affiche une seule carte de solde. Une suppression demande une confirmation. Les erreurs de saisie s'affichent sous les champs et le premier champ invalide reçoit le focus.

## Comment s'en servir pour la suite

1. **Chantier P0-1** met en place les assertions, le script `npm test` et la CI.
2. **Chantiers P0-2 et P0-3** introduisent le modèle daté et calculent le vrai disponible. Sur la démo au 29 mai 2026, il vaut **98,50 €**.
3. Ne pas modifier un attendu pour faire passer un test sans l'avoir justifié par écrit.

## Ordre d'exécution recommandé

1. P0-1, P0-4, P0-6 : tests, retrait de la démo par défaut, hygiène.
2. P0-2, P0-3, P0-5 : modèle daté, vrai disponible par point bas, export et import.
3. P1 : onboarding, écran « Aujourd'hui », échéancier, navigation, accessibilité.
4. [Pilote avec cinq utilisateurs réels](pilote-p1.md), puis décision d'aller ou non plus loin.

Le détail, les efforts et les critères d'acceptation sont dans le rapport F.
