# P5 — Compte facultatif et verrouillage de l’application (révision 2)

Plan de conception, **sans code**. La révision 2 intègre l’audit contradictoire de la révision 1 (contradictions C1 à C14, risques S1 à S8, arbitrages D1 à D7). Chaque affirmation sur le code a été vérifiée sur `main` (commit `deb1cf4`, contenu applicatif identique à `9b5129a`). La section 11 est une auto-relecture contradictoire : les risques qui restent, écrits par l’auteur du plan.

Règle de validation du chantier : **aucune personne ne doit pouvoir perdre son budget ou voir celui d’une autre à cause d’une connexion, d’une déconnexion ou d’un verrouillage.** Tant qu’un test ne le démontre pas, la PR n’est pas prête.

---

## 1. Trois promesses distinctes

La révision 1 les mélangeait. Elles sont désormais séparées partout, y compris dans les textes affichés.

| Promesse | Ce qu’elle garantit | Ce qu’elle ne garantit pas |
|---|---|---|
| **Verrou de l’application** | L’interface normale n’affiche aucun montant tant que le verrou est engagé | La confidentialité des données stockées dans le navigateur |
| **Chiffrement de la copie synchronisée** (existant) | La copie envoyée à Supabase est chiffrée sur l’appareil avec la phrase secrète ; le serveur ne peut pas la lire directement | La protection contre un code d’application compromis, une extension malveillante ou un logiciel espion sur l’appareil |
| **Changement de compte sûr** | Une déconnexion n’efface le budget local qu’après preuve qu’il est identique à la copie en ligne ; une nouvelle connexion ne mélange jamais deux budgets | — |

**Le stockage local n’est pas chiffré par Boussole dans cette version.** Le budget est un JSON en clair dans `localStorage` (`lib/budget-state.ts`, clé `boussole-budget-v2`). Sa protection dépend du code du téléphone et du navigateur.

---

## 2. Modèle de menace (texte de la page Confidentialité et des réglages)

| Situation | Effet |
|---|---|
| Une personne prend le téléphone déverrouillé et ouvre Boussole, verrou actif | Écran de verrouillage. Aucun montant affiché. La récupération du code exige plus que l’accès à la messagerie (§4.5). |
| Aperçu dans le sélecteur d’applications | Boussole masque son interface au passage en arrière-plan **dans les environnements compatibles**. Cette protection ne garantit pas de masquer toutes les captures système. |
| Une autre personne se connecte à son compte sur le même navigateur | Aucune donnée du compte précédent : effacée à une déconnexion prouvée (§6), ou soumise à une décision explicite avant toute synchronisation (§7). |
| Lecture du coffre en ligne par le serveur | Impossible sans la phrase secrète. |
| Code de l’application modifié, extension de navigateur malveillante, logiciel espion | **Non protégé.** Ils peuvent lire ce que l’application affiche ou stocke. |
| Accès aux données du navigateur (outils de développement, sauvegarde du téléphone, extraction) | **Non protégé** : le budget local est en clair. |
| Fichier de sauvegarde JSON téléchargé | **En clair.** Toute personne qui obtient le fichier peut lire le budget. Avertissement ajouté sur la page Sauvegarde. |

Texte à l’activation du verrou : « Le verrou empêche une personne qui a ton téléphone en main de voir tes finances dans Boussole. Il ne chiffre pas les données enregistrées sur ce téléphone et ne remplace pas le code de ton téléphone. »

---

## 3. Démarrage et ordre de rendu (C11)

- `LockGate` enveloppe **tout** le contenu de `components/layout/AppWrapper.tsx`, sous `AppProvider` et `CloudSyncProvider`.
- Rendu serveur et premier rendu client : `LockGate` affiche un **écran neutre** (logo, aucun enfant rendu). Le budget n’est de toute façon jamais dans le HTML serveur : il n’existe que dans `localStorage`.
- Après montage : lecture synchrone de `boussole-lock-v1`. Verrou actif → écran de verrouillage ; inactif → enfants. **Aucun enfant n’est rendu avant cette décision.**
- **Au lancement à froid, le verrou est toujours engagé** s’il est actif, quel que soit le délai.

---

## 4. Verrou

### 4.1 Réglages (« Plus → Compte et sécurité »)
- « Verrouiller Boussole » : code à **6 chiffres** saisi deux fois.
- « Déverrouiller avec le verrouillage du téléphone » : proposé si `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()` répond vrai **et** si `AuthenticatorAttestationResponse.prototype.getPublicKey` existe. Libellé honnête : le téléphone peut demander Face ID, l’empreinte **ou son propre code** (S1).
- Délai : **« Immédiatement » (défaut)**, « Après 1 minute », « Après 5 minutes » (D6).
- Bouton « Verrouiller » dans l’en-tête quand le verrou est actif.

### 4.2 Code
- Enregistrement local `boussole-lock-v1` : `{ version: 1, salt, hash, iterations: 200000, failedAttempts, retryAt, delay, credential? }`. Hachage PBKDF2-SHA-256 (`crypto.subtle`), sel de 16 octets (`crypto.getRandomValues`), comparaison en temps constant.
- Essais : après 5 échecs, attente de 30 s, puis doublement (60 s, 120 s…), plafond 15 min. L’attente est fondée sur l’horloge de l’appareil.
- **Limite assumée (S5)** : ce compteur décourage les essais dans l’interface. Une personne capable de modifier le stockage du navigateur peut le contourner ; elle peut aussi lire le budget directement (§2). Ce n’est pas une protection cryptographique.

### 4.3 Déverrouillage par le téléphone (WebAuthn, vérifié localement)
Enregistrement :
- `navigator.credentials.create` : `rp.id` = domaine de production, `user.id` = 16 octets aléatoires, `challenge` = 32 octets aléatoires, `pubKeyCredParams` = ES256 (-7) puis RS256 (-257), `authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }`, `attestation: 'none'`.
- Contrôles : `clientDataJSON.type === 'webauthn.create'`, `challenge` identique, `origin === location.origin`. On conserve `credentialId`, la clé publique (`response.getPublicKey()`, format SPKI) et l’algorithme (`response.getPublicKeyAlgorithm()`).

Déverrouillage :
- `navigator.credentials.get` avec un **nouveau** `challenge` de 32 octets, `allowCredentials: [credentialId]`, `userVerification: 'required'`.
- Contrôles, tous obligatoires : `type === 'webauthn.get'` ; `challenge` identique à celui émis et utilisé une seule fois ; `origin === location.origin` ; `rpIdHash` = SHA-256 du `rp.id` ; drapeaux **UP** et **UV** présents ; signature vérifiée avec `crypto.subtle.verify` sur `authenticatorData ‖ SHA-256(clientDataJSON)` (pour ES256, conversion de la signature DER en format brut 64 octets).
- Tout échec renvoie au code.
- Ce que cette vérification apporte et n’apporte pas : elle refuse une réponse rejouée ou fabriquée sans l’authentificateur ; elle ne protège pas contre un code d’application modifié, qui pourrait désactiver tout verrou local (§2).

Domaine (S8) : une clé est liée au domaine. Les préversions Vercel ont des domaines différents : la biométrie y est à réactiver. **Décision à prendre avant l’ouverture publique** : un domaine définitif (ex. un sous-domaine de Start’OnLab). Changer de domaine plus tard oblige chaque personne à réactiver la biométrie ; le code reste valable.

### 4.4 Déclenchement
- `visibilitychange` → `hidden` : heure enregistrée en mémoire et dans `sessionStorage` ; ajout **synchrone** de la classe `privacy-veil` sur `document.documentElement` (fond uni, contenu masqué par CSS), en dehors de React.
- Retour `visible` : retrait de la classe ; `shouldLock({ hiddenAt, now, delay })` → verrouillage si `now − hiddenAt >= delay` (délai 0 : tout passage en arrière-plan verrouille).
- Rechargement ou redémarrage du navigateur : lancement à froid → verrouillé.

### 4.5 Code oublié (S2, C10, C13)
L’accès à la messagerie **ne suffit jamais** à afficher le budget local.
1. Si le déverrouillage par le téléphone est actif : le proposer.
2. **Avec compte** : « Effacer ce téléphone et récupérer mon budget en ligne ».
   - Avant d’effacer, sans rien afficher du budget, Boussole indique si des modifications de ce téléphone ne sont pas encore en ligne (comparaison d’empreintes, §6.2) : « Les modifications faites sur ce téléphone depuis le <date> seront perdues. »
   - Effacement local complet (§6.3), puis connexion par code e-mail **et** saisie de la phrase secrète, puis récupération du coffre.
3. **Sans compte** : « Effacer Boussole sur ce téléphone », puis, si la personne a un fichier de sauvegarde, « Restaurer une sauvegarde » (page existante).
Avertissement à l’activation du verrou sans compte ni déverrouillage par le téléphone : « Sans compte, un code oublié oblige à effacer le budget de ce téléphone. Garde une sauvegarde ou crée un compte. »

### 4.6 Plusieurs onglets (S6)
- Canal `BroadcastChannel('boussole-security')` (repli : événement `storage` sur la clé `boussole-security-event`).
- Messages : `locked`, `signing-out`, `signed-out`, `account-changed`, `local-erased`.
- `locked` : tous les onglets se verrouillent immédiatement. Le déverrouillage reste propre à chaque onglet.
- `signing-out` : les autres onglets affichent un écran bloquant « Déconnexion en cours » et suspendent leurs envois automatiques.
- `signed-out`, `account-changed`, `local-erased` : les autres onglets démontent l’interface et rechargent la page.

---

## 5. Premier lancement et création de compte

### 5.1 Écran de choix (`components/onboarding/AccountChoice.tsx`, avant l’étape 1 de `BudgetOnboarding`)
- **Créer mon compte** (bouton principal) : « Sauvegarde en ligne chiffrée, plusieurs appareils, et plus tard le partage en couple. La copie en ligne est chiffrée sur ton téléphone avant l’envoi : nous ne pouvons pas la lire. »
- **J’ai déjà un compte**.
- **Continuer sans compte** (lien secondaire) : « Tout reste sur ce téléphone. Tu pourras créer un compte plus tard. »
- La démo et la restauration restent accessibles. L’écran n’apparaît pas si `cloudConfigured` est faux.

### 5.2 Phrase secrète (D2, S7)
- Générée par défaut : 4 groupes de 5 caractères dans `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (31 symboles), soit `log2(31^20)` ≈ 99,1 bits.
- Tirage : `crypto.getRandomValues` sur des octets ; **rejet** des octets ≥ 248 (= 31 × 8), puis `octet % 31`. Tirage uniforme, sans biais. Fonction `generatePassphrase(random = crypto.getRandomValues)` testable avec un générateur injecté.
- « Choisir ma propre phrase » : règle actuelle, 12 caractères minimum.
- Enregistrement dans le trousseau : vrai formulaire avec e-mail `autocomplete="username"` (lecture seule) et phrase `autocomplete="new-password"`, soumis normalement. Déverrouillage sur un autre appareil : `autocomplete="current-password"`.
- Bouton « Copier ». **Pas de téléchargement de la phrase en fichier texte.**
- Case obligatoire « J’ai enregistré ma phrase secrète dans mon gestionnaire de mots de passe ou dans un endroit sûr ».
- Texte : « Si tu perds tous tes appareils et cette phrase, personne ne pourra récupérer ta copie en ligne, pas même nous. »

### 5.3 Ordre et création du coffre (C6)
1. E-mail → code → connexion. 2. Phrase secrète. 3. Les trois questions du premier budget. 4. **Création explicite du coffre** : comme `decideSync` renvoie `idle` pour un budget vide, la fin de l’étape 3 appelle `runSync` et attend `create`. L’écran indique « Copie en ligne créée » ou, en cas d’échec, « La copie en ligne n’a pas pu être créée. Ton budget est sur ce téléphone. » avec « Réessayer ». 5. Proposition du verrou.

### 5.4 Sans compte (C12)
Après les trois questions, l’écran de résultat (`OnboardingResult`) propose aussi « Verrouiller Boussole avec un code ? ».

### 5.5 Personnes existantes
Aucun changement imposé. « Plus → Compte et sécurité » propose « Créer un compte pour ce budget » : intention explicite d’associer (§7, cas A).

---

## 6. Déconnexion prouvée (C2, C3, C7, C8, C9, D5)

### 6.1 Déroulé de « Se déconnecter »
1. **Gel** : écran bloquant « Déconnexion en cours » ; envoi `signing-out` aux autres onglets ; annulation du minuteur d’envoi automatique (1,5 s) ; attente de la fin de toute synchronisation en cours (`busy` dans `CloudSyncProvider`).
2. **Envoi** : `runSync` une fois.
3. **Preuve** (§6.2).
4. Preuve obtenue → **effacement** (§6.3), puis `auth.signOut({ scope: 'local' })`, envoi `signed-out`, retour à l’écran de choix.
5. Preuve impossible → déconnexion **bloquée**. Message : « Ton budget n’a pas pu être vérifié en ligne. Rien n’a été effacé. » Choix :
   - « Réessayer » ;
   - « Rester connecté » ;
   - « Me déconnecter sans effacer ce téléphone » : avertissement « Ton budget restera sur ce téléphone, sans compte. Toute personne qui ouvre Boussole sur ce téléphone pourra le voir, sauf si le verrou est actif. » La session est fermée, le budget local devient un budget sans compte, la mémoire de synchronisation est effacée.
   Un téléchargement de sauvegarde **n’autorise pas** l’effacement (C9) : on ne peut pas vérifier qu’un fichier exploitable a été enregistré.

### 6.2 Preuve d’identité entre le local et l’en-ligne
`proveSynced({ localBudget, remote, key })` :
- lit la copie en ligne (`fetchVault`), la **déchiffre**, calcule `fingerprint(serializeBudget(budgetEnLigne))` ;
- calcule `fingerprint(serializeBudget(budgetLocal))` (même format que `exportBudget`) ;
- preuve = empreintes identiques.
Ce contrôle couvre la réponse réseau perdue après une écriture réussie : le contenu en ligne est comparé, pas l’état de l’interface.

La même comparaison est ajoutée à `runSync` avant de déclarer un **conflit** : si la copie en ligne déchiffrée a la même empreinte que le budget local, la mémoire de synchronisation est mise à jour et il n’y a pas de conflit. Cela évite un faux conflit après une réponse perdue.

### 6.3 Effacement local
Dans cet ordre, chaque étape vérifiée :
1. `localStorage` : suppression de `boussole-budget-v2`, `boussole-budget-v1`, `boussole-sync-v1`, `boussole-lock-v1`, `boussole-payment-reminders`, `boussole-security-event` ; relecture pour vérifier l’absence.
2. IndexedDB `boussole-cloud` : suppression des clés, **avec propagation des erreurs** (à corriger dans `clearStoredKey`, qui les ignore aujourd’hui), puis relecture pour vérifier l’absence.
3. État en mémoire remis à zéro (rechargement de la page après la déconnexion).
Wording : « supprimé de Boussole sur ce téléphone », jamais « effacement sécurisé » (C7 : le navigateur ne garantit pas l’effacement physique).
Échec d’une étape : « L’effacement n’est pas complet. » + « Réessayer ». Jamais de message de succès après un effacement partiel.

### 6.4 Déconnexion non demandée (C3)
Session expirée, révoquée ou fermée ailleurs (`onAuthStateChange` → `SIGNED_OUT` sans déconnexion lancée ici) :
- **le budget local est conservé** (aucune preuve possible, l’effacer risquerait une perte) ;
- si le verrou est actif, l’application se verrouille ;
- bandeau « Tu n’es plus connecté. Reconnecte-toi pour reprendre la synchronisation. » ;
- à la reconnexion **du même compte** (même `userId` que la mémoire de synchronisation), reprise normale ; d’un **autre compte**, cas §7.

### 6.5 Suppression du compte (C5)
Parcours séparé de la déconnexion :
1. Confirmation : « Le compte et la copie en ligne seront supprimés définitivement. »
2. `deleteCloudAccount()`.
3. Choix local : « Garder mon budget sur ce téléphone, sans compte » ou « L’effacer aussi » (§6.3).
Aucune preuve de synchronisation n’est demandée : la copie en ligne est volontairement supprimée.

---

## 7. Connexion d’un compte sur un appareil qui contient déjà un budget (C4)

Nouvel état de `CloudSyncProvider` : **`awaiting-association`**. Tant qu’il dure, `runSync`, l’envoi automatique, la synchronisation au retour sur l’app et au retour réseau sont **interdits**.

Entrée dans cet état : après connexion **et** saisie de la phrase secrète, si le budget local n’est pas vide **et** si la mémoire de synchronisation n’appartient pas à ce `userId`, **sauf** intention explicite d’associer (cas A).

| Cas | Copie en ligne du compte | Choix proposés |
|---|---|---|
| A. « Créer un compte pour ce budget » depuis les réglages | absente | Association directe (création du coffre), sans écran intermédiaire |
| B. Budget local présent, compte **sans** copie en ligne | absente | « Associer ce budget à mon compte » · « Commencer avec un budget vide » (efface le local après confirmation) · « Annuler » (déconnexion, local conservé) |
| C. Budget local présent, compte **avec** copie en ligne | présente | « Remplacer ce budget par celui de mon compte » (récupération après confirmation) · « Annuler » |

Aucun contenu du budget local n’est affiché sur ces écrans. Fonction pure `associationDecision({ localIsEmpty, memoryUserId, userId, remoteExists, intent })` testée.

---

## 8. Fichiers touchés

Nouveaux : `lib/app-lock.ts` (hachage, comparaison, essais, `shouldLock`), `lib/webauthn-lock.ts` (création, contrôle, vérification de signature), `lib/passphrase.ts`, `lib/account-lifecycle.ts` (`associationDecision`, `signOutSteps`, `proveSynced` sans réseau injecté), `lib/security-channel.ts`, `components/security/LockGate.tsx`, `LockScreen.tsx`, `LockSettings.tsx`, `components/onboarding/AccountChoice.tsx`, `components/sync/AssociationChoice.tsx`, `components/sync/SignOutFlow.tsx`.

Modifiés : `components/layout/AppWrapper.tsx`, `TopHeader.tsx`, `components/sync/CloudSyncProvider.tsx` (état `awaiting-association`, gel, comparaison avant conflit, suppression du compte séparée), `lib/cloud-remote.ts` (`clearStoredKey` qui propage les erreurs), `components/onboarding/BudgetOnboarding.tsx`, `app/synchronisation/page.tsx` (« Compte et sécurité », même URL), `app/plus/page.tsx` (libellé de l’entrée), `app/sauvegarde/page.tsx` (avertissement fichier en clair), `app/confidentialite/page.tsx` (§2), `app/globals.css` (`privacy-veil`), `docs/audit/README.md`.

---

## 9. Tests

### 9.1 Unitaires (`npm test`)
1. Code : bon accepté, mauvais refusé, sels différents → hachages différents, aucune trace du code dans l’enregistrement.
2. Essais : 5 échecs → 30 s ; 6ᵉ → 60 s ; plafond 15 min ; succès → remise à zéro ; état conservé après relecture du stockage.
3. `shouldLock` : délai 0, 60 s, 300 s ; retour à 59 s, 60 s, 61 s.
4. `generatePassphrase` avec générateur injecté : format exact ; octets ≥ 248 rejetés (séquence d’entrée connue → sortie connue) ; les 31 symboles atteignables ; entropie théorique 99,1 bits ; la fonction par défaut utilise `crypto.getRandomValues`.
5. WebAuthn (paires de clés ES256 générées par `crypto.subtle` dans le test, données d’authentificateur construites à la main) : réponse valide acceptée ; refusée si `challenge` différent ou déjà utilisé, `origin` différente, `type` faux, `rpIdHash` faux, drapeau UV absent, drapeau UP absent, signature altérée, clé publique d’une autre inscription.
6. `associationDecision` : les cas A, B, C, budget local vide, même compte.
7. `proveSynced` : identique → preuve ; une dépense de plus en local → pas de preuve ; copie en ligne plus récente que le local → pas de preuve ; mauvaise phrase → erreur, pas de preuve.
8. `signOutSteps` : preuve → effacement ; sans preuve → blocage, aucun effacement ; échec simulé de la suppression IndexedDB → « effacement incomplet », pas de succès.

### 9.2 Navigateur (Playwright, build de production, 390 × 844)
9. Premier rendu verrouillé : aucun montant dans le DOM avant, pendant et après l’hydratation (capture du DOM à chaque étape).
10. Deux onglets : verrouiller l’un → l’autre verrouillé ; déconnecter dans l’un → l’autre bloqué puis rechargé, sans budget affiché.
11. Déconnexion de A puis connexion de B sans recharger : aucune donnée de A visible ni envoyée vers le coffre de B (vérification du coffre de B).
12. Déconnexion non demandée simulée (session supprimée dans un autre onglet) : budget conservé, verrouillé, bandeau affiché.
13. Ajout d’une dépense puis « Se déconnecter » dans la seconde suivante : la dépense est dans la copie en ligne ou la déconnexion est bloquée ; jamais perdue.
14. « Se déconnecter » pendant une synchronisation en cours : attente puis preuve, ou blocage.
15. Réponse réseau perdue après une écriture réussie (requête Supabase interceptée, réponse supprimée) : pas de faux conflit, preuve obtenue au second essai.
16. Création de compte avant le premier budget : coffre créé à la fin de l’étape 3 et récupéré sur un second navigateur.
17. Association : budget sans compte + compte vide (cas B) ; budget sans compte + compte avec copie (cas C) ; aucun envoi avant le choix (requêtes vers `budget_vaults` interceptées et comptées : 0).
18. Code oublié avec compte : impossible d’afficher le budget local sans effacement préalable ; après effacement, récupération exigeant code e-mail **et** phrase secrète.
19. Suppression du compte : parcours complet, sans blocage, choix local respecté.
20. Biométrie avec l’authentificateur virtuel de Chromium (CDP `WebAuthn.addVirtualAuthenticator`, `hasUserVerification: true` puis `false`) : activation et déverrouillage ; refus si UV absent.
21. Verrou proposé après un premier budget sans compte.
22. Retour après 59 s, 60 s, 61 s avec un délai d’une minute ; redémarrage du navigateur → verrouillé.
23. `privacy-veil` présente pendant `hidden` (test technique seulement, voir 9.3).
24. axe-core : 0 violation sur l’écran de choix, la phrase secrète, le verrouillage, les réglages, l’association, la déconnexion bloquée.
Les tests 11 à 19 utilisent le vrai projet Supabase avec des comptes jetables supprimés ensuite.

### 9.3 Recette manuelle sur appareils (avant fusion, captures à l’appui)
iPhone (Safari et PWA installée) et Android (Chrome et PWA installée) : aperçu du sélecteur d’applications, proposition d’enregistrement dans le trousseau iCloud et Google, remplissage automatique sur un second appareil, déverrouillage par le téléphone. Les limites constatées sont écrites dans la page Confidentialité.

---

## 10. Décisions (révisées après audit)

| # | Décision | Changement par rapport à la révision 1 |
|---|---|---|
| D1 | Compte facultatif, proposé en premier, présenté comme sauvegarde et synchronisation, pas comme sécurité locale | Texte corrigé |
| D2 | Phrase générée sans biais, confiée au trousseau, pas de fichier texte | Tirage par rejet ; téléchargement retiré |
| D3 | Code à 6 chiffres, verrou d’affichage | Limite écrite |
| D4 | Pas de chiffrement local dans cette version, dit clairement | Formulations absolues retirées |
| D5 | Effacement à la déconnexion **seulement après preuve** ; sinon blocage ou déconnexion sans effacement, choisie et expliquée | Preuve par contenu déchiffré ; suppression du compte séparée |
| D6 | Délai par défaut « Immédiatement » | Était 1 minute |
| D7 | Verrou proposé avec et sans compte, jamais imposé | Ajout du cas sans compte |

---

## 11. Auto-relecture contradictoire (risques restants)

Écrite par l’auteur du plan, en se plaçant contre lui.

1. **Le verrou peut être contourné par quiconque modifie l’application** (code compromis, extension). Assumé et écrit (§2). Pas de parade dans une application web.
2. **Biométrie et domaine** : tant que le domaine définitif n’est pas choisi, chaque changement de domaine oblige à réactiver la biométrie. Décision attendue du fondateur.
3. **« Me déconnecter sans effacer ce téléphone »** laisse un budget lisible par la personne suivante si le verrou n’est pas actif. C’est un choix explicite, mais il peut être fait sans lire. Mesure : le bouton n’est pas le choix principal et exige une confirmation.
4. **Déconnexion non demandée** : le budget reste sur l’appareil (§6.4). Sur un appareil partagé sans verrou, la personne suivante le verra. Accepté : l’effacer sans preuve ferait perdre des données à quelqu’un dont la session a simplement expiré.
5. **`BroadcastChannel`** n’atteint pas un onglet gelé par le système. À son réveil, cet onglet doit relire l’état de session et du verrou avant d’afficher quoi que ce soit : ajouté au gestionnaire `visibilitychange` (relecture de `boussole-lock-v1` et de la session).
6. **Effacement par `localStorage.removeItem`** : le navigateur peut garder des traces sur le disque. Dit « supprimé de Boussole », pas plus.
7. **Le trousseau iCloud dans une PWA installée** : non vérifié à ce stade ; si la proposition d’enregistrement n’apparaît pas, le bouton « Copier » et la case de confirmation restent le seul filet. Constat à écrire après la recette §9.3.
8. **Horloge de l’appareil** : l’attente après échecs se fonde dessus ; la reculer raccourcit l’attente. Même catégorie que le point 1.
9. **Volume du chantier** : nettement plus gros que la révision 1 (déconnexion prouvée, association, onglets, WebAuthn vérifié). Découpage proposé : **PR A** verrou, code, onglets, voile, code oublié sans compte ; **PR B** WebAuthn vérifié ; **PR C** écran de choix, phrase, création du coffre ; **PR D** déconnexion prouvée, association, suppression du compte, déconnexion non demandée.
