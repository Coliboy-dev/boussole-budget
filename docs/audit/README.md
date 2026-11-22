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

Une charge récurrente annuelle et datée réserve, dans le vrai disponible, ce qu’il faudrait déjà avoir mis de côté pour la payer à temps en épargnant un douzième par mois. Une taxe de 300 € prévue le 15 mars laisse trois versements de 25 € à partir du 20 novembre : 225 € sont réservés ce jour-là, puis la réserve grandit chaque mois. Juste après l’échéance précédente, il reste onze versements et un douzième suffit. Si la facture tombe dans l’horizon de 35 jours, son montant complet figure dans la projection. Le disponible baisse ainsi progressivement, sans chute brutale à l’approche de la facture. La mensualisation de la charge reste comprise dans le total mensuel des charges.

## Première ouverture et conseils

Un nouveau navigateur propose trois questions sur le solde bancaire, la prochaine rentrée certaine et les factures à payer. Le solde et les échéances saisies sont enregistrés ensemble, puis le premier vrai disponible s’affiche avec le détail du calcul. Le revenu et les factures saisis sont ponctuels. Un budget déjà enregistré ou restauré ouvre directement le tableau de bord. La démo en lecture seule et la restauration sont accessibles dès le premier écran.

Les conseils utilisent les données du budget. Les pages de médiation et de documents sont masquées jusqu'à leur implémentation.

## Écran Aujourd’hui

Le premier écran du budget affiche le vrai disponible, la date de fin de la projection et l’explication du point bas. Le même bloc contient le solde bancaire, modifiable sur place, et la réserve de sécurité, qui ouvre son réglage. Il présente ensuite les trois prochaines échéances avec un bouton **Payé**, qui débite le solde et propose **Annuler**, et indique le nombre de retards. La courbe montre le solde prudent en fin de journée sur le même horizon. Le curseur permet de lire le solde à une date précise.

## Mise à jour du solde

Quand le solde a été saisi il y a trois jours ou plus, ou qu’une échéance est passée depuis, **Aujourd’hui** le signale et propose **Mettre à jour**. Après la saisie du solde affiché par la banque, Boussole liste les échéances dont la date est atteinte et demande lesquelles ce solde contient déjà. Celles prévues après la dernière mise à jour du solde sont cochées par défaut. Les échéances cochées sont marquées comme payées sans débiter le solde une seconde fois ; les autres restent à payer. `tests/balance-update.test.mjs` vérifie que le vrai disponible obtenu ainsi est identique à celui d’un paiement saisi à la main, et qu’omettre la confirmation déduirait deux fois le loyer et la mensualité.

## Échéancier

L’échéancier réunit les charges, les dettes et les rentrées prévues dans la page **Échéancier**. Les échéances en retard sont regroupées en haut. Un appui sur **Payé** enregistre l’échéance et débite le solde. Le vrai disponible est recalculé. **Annuler** rétablit le dernier paiement effectué sur cette page tant que le budget reste inchangé. Si le paiement est déjà déduit de ton solde, enregistre-le depuis **Charges** ou **Dettes** en cochant la case correspondante.

Les quatre onglets sont **Aujourd’hui**, **Échéances**, **Budget** et **Plus**. Dans **Plus → Réglages**, tu peux changer ton prénom et ta réserve, ouvrir la démo en lecture seule ou effacer le budget de cet appareil. L’écran **Aujourd’hui** donne aussi accès au réglage de la réserve.

## Listes et page Budget

**Revenus**, **Charges** et **Dettes** affichent une ligne par élément : icône, libellé, échéance et montant. Seules les situations à traiter portent un badge (retard, date à renseigner, revenu incertain, médiation). Un appui ouvre le détail, qui regroupe les chiffres, l’enregistrement du paiement, **Modifier** et **Supprimer**. La suppression demande une confirmation dans le détail.

**Budget** indique le chiffre clé de chaque rubrique et la **Répartition du mois** : revenus certains, charges, dettes et reste, en moyenne mensuelle. Les revenus incertains ne sont pas comptés. Un dépassement est signalé. Cette carte reprend les totaux du moteur de calcul sans le modifier ; le vrai disponible reste le chiffre qui tient compte des dates.

## Accessibilité

Le premier lien au clavier donne accès au contenu. Les fenêtres de saisie gardent le focus dans la modale, se ferment avec Échap et rendent le focus à leur bouton d’ouverture. Les actions principales ont une cible d’au moins 44 pixels. Les contrôles axe-core WCAG 2.0 à 2.2 A/AA ont signalé zéro violation dans Chromium à 390 × 667 sur les pages du budget, les formulaires en modale et les trois étapes du premier budget.

## Remboursement des dettes

La page **Dettes** affiche le restant dû et, quand le calendrier le permet, la date de fin estimée au rythme des paiements prévus. La dernière mensualité est limitée au restant dû. Pour une dette sans échéance ouverte, tu peux saisir directement le montant payé. Le paiement diminue le restant dû et le solde, sauf quand tu indiques que le paiement est déjà déduit du solde.

## Conseils et objectifs (P2-7)

Les objectifs affichent un statut calculé à partir de ta capacité d’épargne mensuelle et de la date cible. Une carte fragile ou à reporter indique le chiffre ou l’échéance qui explique le résultat.

Chaque conseil affiche le montant ou le nombre qui le déclenche. Le conseil sur les revenus incertains indique le nombre et le total des versements encore ouverts sur la période de projection. Le conseil d’épargne indique la capacité mensuelle et le vrai disponible qui limitent le montant proposé.

## Application installable

Utilise le build de production sur HTTPS, ou sur localhost pour un test. Ouvre l’application en ligne jusqu’à ce que **Plus** affiche **Mode hors ligne prêt**. Le cache garde les pages et les ressources de cette version. Le budget reste dans le stockage local. Le parcours hors ligne a été vérifié dans Chromium avec un profil mobile Android. L’installation sur les téléphones du pilote reste à vérifier.

Dans **Plus → Réglages**, utilise **Demander le stockage persistant** pour solliciter la protection du navigateur contre l’effacement automatique. L’écran affiche le résultat. La décision dépend du navigateur. Garde une copie JSON dans les fichiers de ton appareil.

Les pages **Confidentialité** et **Mentions légales** sont accessibles dans **Plus**. La confidentialité décrit le traitement des données techniques par Vercel. Les mentions légales indiquent la dénomination, l’adresse, l’e-mail, le numéro d’entreprise (BCE) et le numéro de TVA de Start’OnLab.

Les pages et les ressources HTTP portent la directive `noindex`. Le fichier `robots.txt` laisse les moteurs consulter les URL pour qu’ils puissent lire cette directive et retirer les URL déjà indexées. [Documentation Google sur la désindexation](https://developers.google.com/search/docs/crawling-indexing/block-indexing)

## Sauvegarde du budget

Dans **Sauvegarde**, le bouton de téléchargement crée un fichier JSON v2 qui contient le budget complet en centimes. Pour le restaurer, choisis le fichier puis confirme le remplacement du budget sur cet appareil.

**Aujourd’hui** affiche la date du dernier téléchargement JSON lancé pour le budget depuis cet appareil. Un rappel s’affiche dès la première sauvegarde à faire, puis à partir de sept jours après le dernier export. Un import ou un effacement remet la date à zéro. Le rappel est affiché dans l’application.

Le même schéma contrôle le fichier et le stockage du navigateur. Une version incompatible, une date invalide ou une dette avec un montant négatif est signalée. L'application charge les données avant de les écrire et ne remplace le budget actif qu'après l'enregistrement réussi de l'import. La migration automatique d'un ancien budget conserve la copie v1.

## Rappels d’échéance (P2-4)

Dans **Aujourd’hui**, la mention **À payer demain** s’affiche pour chaque facture ou mensualité encore à payer le lendemain, à la date de Bruxelles. Les rappels sont visibles en ouvrant l’application, y compris hors ligne. Tu peux les désactiver dans **Plus → Réglages → Rappels d’échéance**. Le réglage est enregistré sur cet appareil.

## Verrouillage de l’application (P5-A)

**Plus → Compte et sécurité → Verrouillage** active un code à 6 chiffres. Le code n’est pas enregistré : seule une empreinte PBKDF2-SHA-256 (200 000 itérations, sel aléatoire) est gardée sur l’appareil. Au lancement, Boussole est toujours verrouillé ; en quittant l’application, il se verrouille immédiatement, ou après 1 ou 5 minutes selon le réglage. Après 5 codes faux, une attente de 30 secondes s’impose, puis double à chaque échec (15 minutes au plus).

Pendant le verrouillage, ni le budget, ni l’en-tête, ni la navigation ne sont rendus. En arrière-plan, un voile masque l’interface ; au retour, il n’est retiré qu’une fois l’écran de verrouillage affiché. Verrouiller un onglet verrouille les autres ; un onglet qui a manqué le message se verrouille à son retour. « Code oublié ? » efface Boussole sur le téléphone après la saisie du mot EFFACER : budget, réglages, verrou, session et trousseau de chiffrement, chaque suppression étant vérifiée.

Le voile est posé à la perte du focus, au passage en arrière-plan et à la fermeture de la page ; il est levé au retour (visibilité, `pageshow`, focus) et, en dernier recours, au premier toucher, toujours après la décision de verrouillage. Sur iPhone, le voile n’atteint pas l’aperçu du sélecteur d’applications : iOS le capture avant (essai du 21 novembre 2026 avec la préversion `5a5e62d` : montants visibles dans Chrome et dans l’app installée). Le cadenas de l’en-tête, utilisé avant de quitter l’app, donne un aperçu sans montant.

Un réglage de verrou illisible n’est jamais traité comme « pas de verrou » : Boussole reste verrouillé et seul l’effacement est proposé. Activer le verrou dans un onglet verrouille les autres onglets déjà ouverts.

Le verrou est une barrière d’affichage : il ne chiffre pas les données locales. `tests/app-lock.test.mjs` couvre l’empreinte du code, les attentes, le délai de verrouillage et l’effacement local.

## Synchronisation chiffrée entre appareils (P2-3)

**Plus → Synchroniser mes appareils** est facultatif. La personne se connecte avec un code reçu par e-mail, puis choisit une phrase secrète d’au moins 12 caractères. Le budget est chiffré sur l’appareil (AES-GCM 256 bits, clé dérivée par PBKDF2-SHA-256, 600 000 itérations) avant tout envoi. La clé reste sur l’appareil, non exportable, dans IndexedDB. Le serveur Supabase (Irlande) ne stocke que l’e-mail, le bloc chiffré, un numéro de version et la date de mise à jour.

Chaque modification est envoyée environ 1,5 seconde après la saisie. Chaque ouverture de l’application récupère la copie en ligne si l’appareil n’a rien changé de son côté. Si les deux côtés ont changé, Boussole demande quelle version garder et n’écrase rien en silence. Le serveur refuse une mise à jour basée sur une version dépassée.

La base est décrite dans `supabase/migrations/`. Chaque compte ne peut lire, modifier ou supprimer que sa propre ligne ; le rôle anonyme n’a aucun droit. **Supprimer mon compte en ligne** efface le compte et sa copie chiffrée ; le budget du téléphone est conservé. Sans les variables `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, la page indique que la synchronisation n’est pas disponible et le reste de l’application fonctionne normalement.

`tests/cloud-sync.test.mjs` vérifie le chiffrement (aller-retour, mauvaise phrase, bloc altéré, absence de montant lisible) et toutes les décisions de synchronisation. Un test de bout en bout à deux navigateurs sur le vrai projet a validé l’activation, la récupération sur un second appareil, le refus d’une mauvaise phrase, la propagation d’une modification, le conflit et la suppression du compte.

## Rattachement du budget à un compte (P5-C0)

La connexion par e-mail est réservée aux comptes existants. Si ton budget est associé à un compte, Boussole le garde sur cet appareil après la déconnexion et le masque jusqu’à ta reconnexion au même compte. Un autre compte ne peut pas l’envoyer ni le remplacer. Pour un budget invité, confirme d’abord le compte auquel tu veux l’associer ou la récupération de sa copie en ligne. Le format des fichiers de sauvegarde reste identique.

Au premier lancement de C0, un budget sans propriétaire enregistré devient invité. Boussole retire les anciennes traces de synchronisation et de connexion locales pour que tu puisses consulter et exporter ton budget hors ligne.

Les parcours Chromium dans `tests/browser/account-guard.mjs` couvrent le changement de compte sur deux onglets, l’association et l’export hors ligne après migration. Une recette sur une instance Supabase locale a vérifié la migration SQL et les règles d’accès avec deux comptes fictifs (§9.5 du plan P5).

## Compte facultatif et premier coffre (P5-C1)

L’inscription dans Boussole est activable pour la recette avec `NEXT_PUBLIC_ACCOUNT_SIGNUP_ENABLED=true`. L’ouverture aux utilisateurs dépend de la validation de l’expéditeur Boussole et de la réception des codes sur le domaine définitif (§5.6 du plan P5). Le parcours de connexion existant conserve `shouldCreateUser: false`. La démo, la restauration et la création d’un budget invité restent accessibles depuis l’écran de choix.

Après le code e-mail, Boussole propose une phrase secrète générée. La personne confirme l’avoir enregistrée avant de créer sa copie en ligne. Le marqueur local `boussole-vault-pending-v1` bloque les envois ordinaires jusqu’à la confirmation du premier coffre. La reprise compare le coffre déchiffré aux dix dernières empreintes distinctes et à celle du budget actuel. Si une tentative précédente correspond, les modifications locales partent après la confirmation. Un coffre chiffré avec des paramètres différents demande sa phrase secrète avant la comparaison.

Une session propriétaire expirée peut ouvrir le budget local pendant le renouvellement si le compte, la clé et le rattachement concordent. Le coffre reste en pause jusqu’à la validation en ligne. Avec une absence de session confirmée, un rattachement illisible peut repasser en mode invité sous le verrou de transition. `tests/browser/account-signup.mjs` couvre ces parcours avec Chromium et une API Supabase simulée.

## Mot de passe du compte et verrou proposé (P5, révision 6.1)

La connexion se fait par e-mail et mot de passe (Supabase Auth, 12 caractères minimum dans l’app et côté serveur). Le code e-mail sert à confirmer l’adresse à l’inscription et à récupérer un compte (« Mot de passe oublié ou pas encore créé ? ») ; après un code, le choix du mot de passe passe avant tout autre écran. Le code à 6 chiffres et Face ID ne sont plus imposés : ils sont proposés une fois après la connexion, avec « Plus tard ». `tests/browser/managed-backup.mjs` couvre l’inscription, la connexion sur un second appareil, le mauvais mot de passe, la récupération, le coffre historique et la proposition du verrou.

## Dépenses et enveloppes : modèle et calcul

Le format de sauvegarde reste en version 2. Les anciennes sauvegardes gardent leur structure. Le moteur traite les champs absents comme des listes vides, une mémoire de commerces vide et une révision de solde à zéro.

Le moteur réserve le reste de chaque enveloppe dès aujourd’hui, puis le montant complet de chaque mois qui commence dans l’horizon de projection. Le simulateur utilise cette même projection. Recopier le solde bancaire enregistre l’écart inexpliqué après avoir tenu compte des échéances cochées. Une dépense déjà comprise dans un solde peut réduire la part non encodée.

Les calculs d’analyse utilisent le montant actuel des charges et des mensualités pour les échéances marquées comme payées. Un ancien paiement est donc estimé à partir du montant actuel si celui-ci a changé. Les règles de saisie rapide et de reconnaissance du commerce sont testées dans le moteur.

## Saisie des dépenses et gestion des enveloppes (P3, PR 2)

Dans **Aujourd’hui** ou **Budget → Dépenses du mois**, ajoute une dépense en renseignant son montant et sa catégorie. La saisie rapide accepte un montant suivi d’un commerce, par exemple « 42,28 Colruyt ». Boussole propose une catégorie et mémorise celle que tu confirmes. Tu peux annuler l’ajout jusqu’à la prochaine modification du budget.

Dans **Dépenses du mois**, choisis un mois pour consulter les dépenses par jour et la part utilisée de chaque enveloppe. Ouvre une ligne pour la modifier ou la supprimer. Si une charge récurrente correspond à la catégorie d’une enveloppe, le formulaire propose de la remplacer et affiche le vrai disponible avant et après avec le montant que tu as saisi. L’Échéancier affiche aussi les réservations des enveloppes.

## Où part mon argent (P3, PR 3)

Depuis **Budget** ou **Dépenses du mois**, ouvre **Où part mon argent** pour consulter le total du mois, sa répartition par catégorie et l’écart avec le mois précédent. Ouvre une ligne pour voir ses opérations. **Non encodé** représente le reste des sorties inexpliquées depuis tes relevés de solde. Pour réduire ce montant, ajoute une dépense oubliée et coche **Déjà comprise dans mon solde** si elle y figure.

Dans une catégorie de dépenses du quotidien, tu peux tester un nouveau montant d’enveloppe et voir son effet sur ton vrai disponible avant d’appuyer sur **Appliquer**. Pour créer une enveloppe, Boussole propose une moyenne des mois précédents renseignés, arrondie aux 5 € supérieurs. Au premier mois renseigné, tu choisis le montant.

## Foyer partagé (P4, PR 1)

Les éléments du foyer sont chiffrés sur l’appareil. Leur identifiant, celui du foyer et la version de clé sont vérifiés au déchiffrement. La route `POST /api/household-key` rend la clé gérée aux membres actifs après vérification du compte et de l’adhésion sous les règles d’accès Supabase. Les invitations expirent après sept jours et sont à usage unique.

La suppression d’un compte efface son adhésion et son profil. Les entrées du foyer restent accessibles à l’autre membre et les références à l’auteur supprimé sont retirées. Au départ du dernier membre, le foyer et ses entrées sont supprimés côté serveur.

Les tests unitaires font partie de `npm test`. Pour relancer la recette d’intégration, applique les migrations sur une instance Supabase locale et renseigne `SUPABASE_LOCAL_URL`, `SUPABASE_LOCAL_PUBLISHABLE_KEY` et `SUPABASE_LOCAL_SECRET_KEY` avec sa configuration. Depuis la racine du dépôt, lance `node --experimental-strip-types --test tests/integration/households.mjs`. Les scénarios utilisent des comptes fictifs et couvrent les accès, les invitations concurrentes, l’ordre des modifications et la suppression de compte.

## Synchronisation du Foyer (P4, PR 2)

Dans **Plus → Notre foyer**, un compte connecté peut créer un foyer et ouvrir son budget commun depuis le sélecteur de l’en-tête. Le même compte permet d’ouvrir le foyer sur un second appareil. Le mode Foyer utilise le réducteur et le moteur de calcul du budget, avec son propre stockage chiffré. Le budget personnel reste dans son espace.

Le registre `household_writes` conserve les identifiants des écritures acceptées. Le renvoi d’un lot après coupure rend le numéro d’origine et préserve les modifications validées entre-temps. Chaque recopie de solde a un UUID distinct. Le calcul sélectionne la dernière recopie validée par le serveur et rattache les dépenses et leurs effets à leur recopie. L’identifiant du moteur reste dans le contenu chiffré et l’UUID de synchronisation est dérivé par foyer, type et identifiant d’origine.

Le débit ou le crédit est chiffré avec l’opération qui le produit. Parmi plusieurs versions d’une échéance, seule la version retenue peut affecter le solde. Une annulation retire cet effet et un nouveau relevé repart de son montant. Le test Supabase fait enregistrer la même échéance par deux comptes et vérifie que le solde passe de 500 € à 400 €, puis revient à 500 € à l’annulation.

Sur l’appareil, les modifications hors ligne restent chiffrées dans la file IndexedDB. Le client les envoie à la reconnexion après avoir vérifié la version de synchronisation dans Supabase. La recette `tests/browser/household-sync.mjs` vérifie le parcours sur deux navigateurs en largeur 390 px avec Supabase local. Lance le build avec l’URL et la clé publique locales dans les variables publiques Supabase et une valeur de test pour `BUDGET_VAULT_MANAGED_KEY_V1`. Renseigne ensuite les variables de la recette d’intégration et `BOUSSOLE_TEST_URL`, puis lance `node --experimental-strip-types --test tests/browser/household-sync.mjs`.

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
