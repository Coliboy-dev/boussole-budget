# P5 — Compte, sauvegarde et verrouillage de l’application (révision 6)

### Révision 6 — Compte obligatoire et copie récupérable par e-mail (22 novembre 2026)

Ce lot part de `main` (`499b754`, C0 et C1 livrés). Il remplace le parcours d’inscription de la PR #23 et les règles de la révision 5.3 relatives au compte facultatif et à la phrase des nouveaux coffres. Les sections historiques documentent aussi les coffres existants, dont la clé reste dérivée de la phrase choisie à leur création.

#### Premier accès

- Après l’ouverture des inscriptions, une personne qui démarre sans budget crée son compte ou se connecte par code e-mail. Elle configure le code de l’appareil et peut activer le déverrouillage par le téléphone si le navigateur le permet. Le code reste utilisable en cas d’annulation ou d’échec de la méthode du téléphone. Appliquer ce passage avant l’affichage du budget sur les routes privées, y compris lors d’un accès direct à une route.
- Une fois le premier budget enregistré, créer automatiquement sa copie en ligne. À la connexion sur un autre appareil, récupérer la copie de ce compte après configuration du verrou local. Les nouveaux coffres s’ouvrent sans phrase secrète.
- Un budget invité déjà présent reste accessible et exportable. Son envoi exige une confirmation qui désigne le compte et le budget concerné. Si un budget local et une copie distante diffèrent, conserver les deux jusqu’à la décision de la personne. Une lecture distante en échec reste distincte d’un coffre absent.
- La vérification du compte reste nécessaire au premier accès. Après un accès vérifié, le mode hors ligne de C1 continue à servir le budget du même compte. Garder les inscriptions fermées en production pendant la recette.

#### Clé gérée par Capiste

- Ajouter par migration un mode de clé explicite sur `budget_vaults`. Attribuer le mode historique aux lignes existantes et préserver les politiques RLS de propriétaire. Les nouveaux coffres gérés gardent le chiffrement AES-GCM et le contrôle de version des écritures.
- La route serveur `/api/budget-key` vérifie le jeton auprès de Supabase et fournit le matériel de clé du compte authentifié. Elle le dérive par HMAC-SHA-256 avec `BUDGET_VAULT_MANAGED_KEY_V1`, un secret de 32 octets aléatoires encodé en base64. Le navigateur réutilise la dérivation et le chiffrement du coffre. La réponse est exclue du cache. Le secret serveur reste dans l’environnement serveur.
- Préserver la reprise C1 du premier envoi et les contrôles au changement de compte. Une panne du service de clé suspend les opérations qui en dépendent. La reprise conserve l’instantané local et respecte les confirmations de remplacement.
- Préserver les anciens coffres et leur mécanisme de lecture. Une éventuelle conversion fera l’objet d’un changement séparé. Elle devra pouvoir ouvrir le coffre avec la clé historique ou la phrase d’origine avant de le réchiffrer à la version lue.
- Mettre à jour la politique de confidentialité à la livraison. Elle annonce la sauvegarde automatique et le fait que Start’OnLab gère les clés des nouveaux coffres. Les copies stockées restent chiffrées. Le service peut les déchiffrer pour les restituer après la connexion.

#### Recette avant ouverture

- Inscription, validation par e-mail, création du code, déverrouillage par le téléphone si disponible, premier budget sauvegardé sans phrase et récupération sur un deuxième navigateur par e-mail.
- Annulation de Face ID, démarrage sans réseau, expiration de session hors ligne, changement de compte dans un autre onglet, jeton absent ou invalide et séparation des clés de deux comptes.
- Budget invité existant, coffre historique, perte de la réponse du premier envoi, écritures concurrentes et refus du remplacement sans choix explicite.
- `npm test`, `npx tsc --noEmit`, `npm run lint` et `npm run build`. Tester les migrations et les écritures sur des données fictives avant d’appliquer quoi que ce soit en production.

#### Activation après validation

Appliquer la migration en premier. Configurer le secret serveur `BUDGET_VAULT_MANAGED_KEY_V1` séparément pour chaque environnement. Conserver une copie protégée de chaque secret et garder le même pour les redéploiements de l’environnement qui l’utilise. Une rotation devra versionner et migrer les coffres avant de retirer un secret encore utilisé.

Activer `NEXT_PUBLIC_MANAGED_BUDGET_BACKUPS=true` pour utiliser les clés gérées. `NEXT_PUBLIC_ACCOUNT_SIGNUP_ENABLED=true` et l’ouverture des inscriptions côté Supabase activent ensuite le parcours obligatoire pour les nouveaux comptes. L’environnement de recette utilise son propre secret, sa propre base et des adresses fictives.

---

Plan revu contre **`main` au commit `cfd94c9`**, qui intègre les lots A et B. La révision 4 a cadré WebAuthn et la révision 5 a précisé les lots C et D. La révision 5.1 rend C0 livrable seul et fixe les conditions d’ouverture de C1.

### Révision 5.3 — Reprise de la création du premier coffre (21 novembre 2026)

Le marqueur `boussole-vault-pending-v1` conserve l’état de la création après rechargement. La synchronisation ordinaire attend la confirmation du coffre et l’enregistrement de sa version et de son empreinte (§5.3). Une session propriétaire expirée peut ouvrir le budget local avant la réponse de Supabase. Seule une erreur reconnue par `isAuthRetryableFetchError` permet de conserver cet accès après un échec du renouvellement (§5.7). Le §9.5 couvre ces deux parcours.

### Révision 5.2 — Accès local avant l’ouverture de C1 (21 novembre 2026)

C0 est fusionné sur `main` au commit `393737c`. La relecture de la PR #21 a relevé deux cas à traiter dans C1 avant l’ouverture des inscriptions (§5.7 et §9.5).

- Une session propriétaire expirée conserve l’accès local quand le renouvellement échoue faute de réseau et que le propriétaire, la session locale et la clé concordent. La synchronisation reprend après validation en ligne du même compte.
- Un rattachement devenu illisible est récupérable en mode invité sous le verrou de transition, après confirmation de l’absence de session. Le budget et ses sauvegardes sont conservés.

### Révision 5.1 — Association du budget et création de compte (21 novembre 2026)

| Lot | Périmètre | Condition de passage |
|---|---|---|
| **C0** | `accountGuard`, propriétaire dans une clé séparée, Web Locks pour les transitions et écran de compte. La connexion existante utilise `shouldCreateUser: false`. | PR autonome après recette sur deux onglets, puis sur le projet Supabase isolé (§9.5). |
| **C1** | Compte facultatif, OTP, phrase secrète, premier budget et création explicite du coffre (§5). | PR séparée après C0. Avant l’ouverture aux utilisateurs, valider l’inscription sur le projet isolé et l’expéditeur au nom de Boussole. |
| **D** | Déconnexion avec preuve, effacement, détachement volontaire et suppression du compte (§6). | Réutilise C0. Peut attendre les premiers usages réels de C1. |

C0 corrige le parcours déjà livré et doit pouvoir être fusionné indépendamment. `sendCode` crée déjà des comptes sur `main`. Si le compte actif diffère du propriétaire du budget local, un coffre absent permet actuellement sa création à partir de ce budget et un coffre présent peut ouvrir un conflit dont l’option distante remplace le budget local. [Connexion et déverrouillage](https://github.com/Coliboy-dev/boussole-budget/blob/cfd94c9/components/sync/CloudSyncProvider.tsx#L231) · [Décision de synchronisation](https://github.com/Coliboy-dev/boussole-budget/blob/cfd94c9/lib/cloud-sync.ts#L32)

Quatre constats structurent ce découpage.

1. `unlock` installe la clé, puis appelle `runSync`. Sans coffre distant, `decideSync` peut créer un coffre à partir du budget local. C0 traite le rattachement avant d’appeler le moteur de synchronisation. [CloudSyncProvider](https://github.com/Coliboy-dev/boussole-budget/blob/cfd94c9/components/sync/CloudSyncProvider.tsx#L249) · [decideSync](https://github.com/Coliboy-dev/boussole-budget/blob/cfd94c9/lib/cloud-sync.ts#L32)
2. `signOut` efface la mémoire de synchronisation et conserve le budget. C0 garde le rattachement du budget à son compte même quand la session se ferme. [CloudSyncProvider](https://github.com/Coliboy-dev/boussole-budget/blob/cfd94c9/components/sync/CloudSyncProvider.tsx#L294)
3. `finishOnboarding` enregistre le budget et renvoie actuellement `void`. C1 doit créer le coffre avec l’état sauvegardé retourné par cette opération, avant d’autoriser la synchronisation automatique. [AppContext](https://github.com/Coliboy-dev/boussole-budget/blob/cfd94c9/lib/context/AppContext.tsx#L390)
4. `AppWrapper` compose `AppProvider`, `CloudSyncProvider` et `LockProvider`. C0 ajoute le contrôle d’association sous le verrou existant et protège aussi les points d’écriture des deux fournisseurs. [AppWrapper](https://github.com/Coliboy-dev/boussole-budget/blob/cfd94c9/components/layout/AppWrapper.tsx#L7)

La migration SQL du dépôt met `user_id` en clé primaire et limite l’accès par RLS à `auth.uid() = user_id`. Le client crée par `INSERT` et traite le doublon `23505` comme une création concurrente. Une mise à jour exige la version attendue. C0 et C1 utilisent ces garanties avec l’identité du budget contrôlée dans le navigateur. La recette isolée vérifie les politiques et la migration en place. [Migration du coffre](https://github.com/Coliboy-dev/boussole-budget/blob/cfd94c9/supabase/migrations/20261120091727_budget_vaults.sql) · [Écritures du coffre](https://github.com/Coliboy-dev/boussole-budget/blob/cfd94c9/lib/cloud-remote.ts#L58)

### Révision 4 (validation du lot B, 21 novembre 2026)

**Périmètre de cette révision : documentation uniquement.** Le lot A (PIN, voile, onglets, effacement invité) est fusionné sur `main` au commit `2862ae0`. Les sections §4.1–4.3 ci-dessous **remplacent les anciennes règles WebAuthn**, sans changer la portée des PR C ou D. Référentiel technique : [WebAuthn Level 3 (W3C)](https://www.w3.org/TR/webauthn-3/), [MDN — Passkeys](https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/Passkeys) et [MDN — Authenticator data](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/Authenticator_data).

**Décisions fermes pour la PR B :** clé WebAuthn locale séparée du PIN ; PIN conservé en toute circonstance ; vérification cryptographique à l'inscription et à l'authentification ; UV obligatoire ; aucune promesse d'usage biométrique ou de liaison exclusive à un téléphone ; aucune libération de l'interface après une sortie réelle pendant le dialogue du téléphone ; tests Chromium **et** recette iPhone réelle avant fusion. Aucun changement de compte, synchronisation distante ou chiffrement local dans ce lot.

### Révision 3 (audit final du 21 novembre)
Corrections ciblées, qui remplacent le texte de la révision 2 là où il diverge :
- **N1** (§4.4) : le voile n’est retiré que par l’écran effectivement affiché, après son rendu ; jamais avant la décision de verrouillage.
- **N2** (§9.2, test 17) : « zéro écriture » avant la décision d’association, les lectures nécessaires restent permises.
- **N3** (§7.1) : nouveau prédicat de vacuité, fondé sur l’égalité avec un budget vide, qui couvre toutes les données (médiation, documents, profil…).
- **N4** (§5.3) : création du premier coffre à partir du budget **retourné** par l’enregistrement, sans passer par l’état React.
- **N5** (§4.3) : ES256 seul ; `rp.id` = domaine de la page, propre à chaque environnement.
- **N6** (§4.5, §6.3, §11) : l’effacement local fiable est une primitive livrée dans la **PR A** ; confirmation explicite avant tout effacement.
- **Affichage pendant l’association** (§7.2) : aucune page budgétaire accessible.
- **Fenêtre de concurrence à la déconnexion** (§6.1) : gel de toutes les écritures dans tous les onglets, et protection d’écriture existante contre la réapparition d’un ancien budget.
- **Tests** sur un projet Supabase de test isolé (§9.2).

Règle de validation du chantier : **aucune personne ne doit pouvoir perdre son budget ou voir celui d’une autre à cause d’une connexion, d’une déconnexion ou d’un verrouillage.** Tant qu’un test ne le démontre pas, la PR n’est pas prête.

---

## 1. Trois promesses distinctes

La révision 1 les mélangeait. Elles sont désormais séparées partout, y compris dans les textes affichés.

| Promesse | Ce qu’elle garantit | Ce qu’elle ne garantit pas |
|---|---|---|
| **Verrou de l’application** | L’interface normale n’affiche aucun montant tant que le verrou est engagé | La confidentialité des données stockées dans le navigateur |
| **Chiffrement de la copie synchronisée** (existant) | La copie envoyée à Supabase est chiffrée sur l’appareil avec la phrase secrète ; le serveur ne peut pas la lire directement | La protection contre un code d’application compromis, une extension malveillante ou un logiciel espion sur l’appareil |
| **Changement de compte sûr** | C0 masque le budget associé tant que l’identité active diffère ou reste incertaine. D efface le budget à la déconnexion seulement après preuve de synchronisation. | La confidentialité du stockage local en dehors de Boussole |

**Le stockage local n’est pas chiffré par Boussole dans cette version.** Le budget est un JSON en clair dans `localStorage` (`lib/budget-state.ts`, clé `boussole-budget-v2`). Sa protection dépend du code du téléphone et du navigateur.

---

## 2. Modèle de menace (texte de la page Confidentialité et des réglages)

| Situation | Effet |
|---|---|
| Une personne prend le téléphone déverrouillé et ouvre Boussole, verrou actif | Écran de verrouillage. Aucun montant affiché. La récupération du code exige plus que l’accès à la messagerie (§4.5). |
| Aperçu dans le sélecteur d’applications | Boussole masque son interface au passage en arrière-plan **dans les environnements compatibles**. Cette protection ne garantit pas de masquer toutes les captures système. |
| Une autre personne se connecte à son compte sur le même navigateur | C0 conserve le budget du compte précédent, le masque et interdit son transfert ou son remplacement depuis le nouveau compte (§7). D ajoute l’effacement après déconnexion prouvée (§6). |
| Lecture du coffre en ligne par le serveur | Impossible sans la phrase secrète. |
| Code de l’application modifié, extension de navigateur malveillante, logiciel espion | **Non protégé.** Ils peuvent lire ce que l’application affiche ou stocke. |
| Accès aux données du navigateur (outils de développement, sauvegarde du téléphone, extraction) | **Non protégé** : le budget local est en clair. |
| Fichier de sauvegarde JSON téléchargé | **En clair.** Toute personne qui obtient le fichier peut lire le budget. Avertissement ajouté sur la page Sauvegarde. |

Texte à l’activation du verrou : « Le verrou empêche une personne qui a ton téléphone en main de voir tes finances dans Boussole. Il ne chiffre pas les données enregistrées sur ce téléphone et ne remplace pas le code de ton téléphone. »

---

## 3. Démarrage et ordre de rendu (C11)

- `LockProvider`, livré en A et réutilisé en B, enveloppe le contenu de `AppWrapper` sous `AppProvider` et `CloudSyncProvider`. C0 conserve ce verrou et ajoute le contrôle de compte à l’intérieur (§7.2).
- Rendu serveur et premier rendu client : `LockProvider` affiche `NeutralScreen` avant de décider quel écran rendre (`LockProvider.tsx:L207–283`). Le budget n’est pas inclus dans le HTML serveur : il provient du stockage local du client.
- Au montage : `readLockState(boussole-lock-v1)` distingue verrou absent, valide ou illisible ; les deux derniers états rendent `LockScreen`. **Aucun enfant budgétaire n'est rendu avant cette décision.**
- **Au lancement à froid, le verrou est toujours engagé** s’il est actif, quel que soit le délai.

---

## 4. Verrou

### 4.1 Réglages (« Plus → Compte et sécurité »)

- Le **PIN Boussole à 6 chiffres reste obligatoire** pour activer cette option, et constitue toujours le secours. Le verrou est facultatif ; « déverrouiller avec le téléphone » est facultatif et **désactivé par défaut**.
- Afficher le réglage uniquement si le PIN est déjà actif et lisible, si le contexte est sécurisé (HTTPS), si `navigator.credentials.create/get` et `PublicKeyCredential` sont présents, et si `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()` répond `true`. Vérifier également la disponibilité des méthodes `AuthenticatorAttestationResponse.getPublicKey/getPublicKeyAlgorithm/getAuthenticatorData` nécessaires à la vérification prévue ; sinon ne pas proposer cette option. **Ces tests détectent des capacités, pas la présence garantie d'une biométrie ni le succès futur d'une inscription.**
- Libellé : **« Déverrouiller avec le téléphone »**, accompagné de « Face ID, empreinte ou code du téléphone, selon l'appareil ». Ne jamais promettre « Face ID » seul.
- **Avant la confirmation d'activation**, afficher : « Si une autre personne connaît le code de déverrouillage de ce téléphone, elle pourrait aussi ouvrir Boussole avec cette option. Tu peux la désactiver à tout moment. Ton code Boussole reste utilisable. » Demander ensuite le **PIN Boussole actuel**, puis déclencher l'inscription WebAuthn par **clic explicite**, sans lancement automatique.
- Activer ou réactiver la méthode WebAuthn demande le PIN actuel et un nouveau geste utilisateur. Pour remplacer une méthode enregistrée comme valide, désactive-la d’abord avec le PIN actuel, puis active-la à nouveau. Le PIN reste utilisable pendant toute l’opération.
- Un déverrouillage WebAuthn réussi **ne remet pas à zéro** le compteur d'échecs du PIN : les deux voies sont indépendantes. Le PIN peut être bloqué temporairement tout en laissant disponible la méthode du téléphone.
- Le délai du verrou reste celui du lot A : « Immédiatement » par défaut, « Après 1 minute », « Après 5 minutes ». Le cadenas manuel et le comportement entre onglets restent inchangés.
- Sur l’écran verrouillé, une méthode configurée et disponible donne accès à « Se déverrouiller » et à « Utiliser mon code Boussole ». Le champ PIN apparaît après ce choix ou si la demande au téléphone échoue. Le champ reçoit le focus et « Code oublié ? » reste dessous. Si une méthode configurée est indisponible, affiche « Le déverrouillage par le téléphone n'est pas disponible dans ce navigateur. Utilise ton code Boussole. », place le focus sur le champ PIN et conserve la référence enregistrée.

### 4.2 PIN et stockage indépendant des credentials

- **État existant à préserver sans migration** : `boussole-lock-v1` est un objet PIN `{version, salt, hash, iterations, failedAttempts, retryAt, delay}`. `readLockState` distingue `absent / valid / unreadable` ; un PIN illisible reste verrouillant. `LockProvider.changePin` recrée actuellement cet objet ; c'est précisément pourquoi **aucune information WebAuthn ne doit y être ajoutée**. Références : `lib/app-lock.ts`, `components/security/LockProvider.tsx`.
- **Nouvelle clé locale :** `boussole-lock-device-v1` (distincte de `boussole-lock-v1`) avec au minimum `version:1`, `credentialId` (base64url de `rawId`), `publicKeySpki` (base64url), `algorithm:-7`, `rpId`, `createdAt` ; ajouter `userHandle` seulement si nécessaire. Limites de longueur, décodage strict, formats de clé et correspondance RP ID sont vérifiés au chargement. **Aucun secret ni clé privée WebAuthn n'est conservé par Boussole.**
- Le lecteur indépendant renvoie `absent | valid | invalid`. `invalid` désactive seulement **l'option téléphone** et affiche « Réactive le déverrouillage avec le téléphone dans les réglages. » ; il ne modifie jamais l'état `boussole-lock-v1`, ne déverrouille pas et n'impose pas l'effacement du budget.
- Boussole écrit la nouvelle référence locale seulement après réussite de toutes les vérifications. Une annulation ou une écriture locale impossible conserve l’état existant et le PIN, avec un message explicite. Après désactivation puis réactivation, un ancien credential peut subsister dans le gestionnaire de passkeys du téléphone.
- **Changement du PIN :** ne touche jamais `boussole-lock-device-v1`. **Désactivation du verrou PIN :** supprimer d'abord la référence WebAuthn, vérifier sa disparition, puis seulement supprimer `boussole-lock-v1` ; en cas d'échec, conserver le PIN actif et annoncer l'échec (ne jamais laisser une suppression incomplète présentée comme réussie).
- **Effacement intégral :** ajouter `boussole-lock-device-v1` à `LOCAL_STORAGE_KEYS` dans `lib/account-lifecycle.ts` et vérifier son absence après `eraseLocalData()`. Un ancien credential externe au navigateur peut subsister, mais **sans référence locale il ne déverrouille plus Boussole**.
- Les credentials sont **locaux à l'origine et au contexte de stockage** de la page/PWA. Une passkey peut être synchronisée ou proposée via un autre appareil par le fournisseur de passkeys ; ne pas l'assimiler à une preuve de possession exclusive de ce téléphone.

### 4.3 WebAuthn — cérémonies vérifiées localement (ES256)

**Principe et limite.** La PR B ajoute un second moyen **d'afficher l'interface après vérification locale de l'utilisateur**. Ce n'est ni une authentification de compte Supabase, ni du chiffrement local, ni une preuve d'identité civile, ni une certitude de reconnaissance biométrique. Le fournisseur peut autoriser le **code de déverrouillage de l'appareil**. Une page ou un stockage compromis peut contourner un verrou purement client ; cela reste explicitement hors modèle de protection (§2). La vérification cryptographique de la signature, en revanche, est **obligatoire** pour faire confiance aux données d'authentification, notamment au drapeau UV.

**Inscription, déclenchée par le bouton après validation du PIN :**

1. Générer via `crypto.getRandomValues` un `challenge` aléatoire de 32 octets, **lié à cette seule tentative** et consommé quel qu'en soit le résultat ; `user.id` aléatoire de 16 octets **à chaque nouvelle inscription**. Le `rp.id` attendu et envoyé est `location.hostname` lorsque autorisé pour cette origine (ne pas forcer le domaine de production dans une préversion `vercel.app`). `pubKeyCredParams: [{type:'public-key', alg:-7}]` (ES256 uniquement), `authenticatorAttachment:'platform'`, `userVerification:'required'`, `residentKey:'discouraged'`, `attestation:'none'`.
2. Pour remplacer une méthode enregistrée comme valide, la personne désactive d’abord la référence locale dans les réglages, puis effectue une nouvelle inscription avec son PIN actuel. Une référence locale illisible ou incompatible peut être remplacée directement après une inscription réussie.
3. Vérifier au retour : objet `PublicKeyCredential` attendu, `type === 'public-key'`, ID non vide, `clientDataJSON.type === 'webauthn.create'`, challenge exact non réutilisable, `origin === location.origin`, `crossOrigin !== true`. Vérifier aussi `response.getPublicKeyAlgorithm() === -7`, une clé publique SPKI non nulle importable comme P-256/ES256 et l'identifiant `rawId` cohérent avec les données attestées de l'authentificateur.
4. Lire les données d'authentificateur de l'inscription (`response.getAuthenticatorData()`, et les champs attestés du `attestationObject` si nécessaire) : longueur/format valides, `rpIdHash === SHA-256(rp.id)`, drapeaux **UP=1 et UV=1**, drapeau de données de credential attesté **AT=1**, ID et clé publique associés au credential enregistré ; rejeter toute incohérence de format, de credential ID, d'algorithme ou d'origine. Avec `attestation:'none'`, **aucune attestation d'origine matérielle ni identité du téléphone n'est prouvée**, et il n'y a pas de signature d'attestation du constructeur à vérifier ; ne pas présenter ces contrôles comme une preuve matérielle.
5. Si un seul contrôle échoue, est indisponible ou si l'écriture locale échoue : ne pas activer la méthode et ne pas altérer le PIN. La conservation d'une précédente configuration WebAuthn en cas d'échec est obligatoire.

**Déverrouillage depuis l’écran verrouillé**

1. Sur une page visible, Boussole lance **une demande automatique** au démarrage avec le verrou actif ou au retour de l’arrière-plan si l’app est verrouillée. Le retour compte une seule fois, même si l’écran était déjà monté et que plusieurs événements signalent le retour. Le cadenas manuel et les messages de verrouillage entre onglets engagent le verrou. Ils laissent la demande suivante à un appui ou à un retour au premier plan. Le bouton « Se déverrouiller » permet un appui explicite si le navigateur exige un geste. Il y a **une seule tentative en cours** par onglet. Chaque demande génère un challenge de 32 octets, mémorisé en mémoire volatile avec un identifiant de tentative. Appeler `navigator.credentials.get` avec `allowCredentials:[{type:'public-key', id:<rawId enregistré>}]`, le `rpId` enregistré et autorisé pour cette origine et `userVerification:'required'`.
2. Après retour, vérifier **tous** les éléments : `PublicKeyCredential.type === 'public-key'`, `rawId/credentialId` exactement égal au credential actif, `clientDataJSON.type === 'webauthn.get'`, challenge exact **à usage unique**, `origin === location.origin`, `crossOrigin !== true`, `rpIdHash === SHA-256(rpId)`, drapeaux UP et UV tous deux présents, `algorithm === -7` et signature ES256 valide de `authenticatorData || SHA-256(clientDataJSON)` avec la **clé publique locale enregistrée**. Consommer le challenge à la réussite, à l'échec, au rejet ou à l'annulation ; refuser toute réponse de tentative précédente.
3. Pour ES256, WebAuthn fournit une signature ECDSA encodée en **ASN.1 DER** ; la conversion robuste et vérifiée vers le format brut P1363 `r||s` (64 octets), attendu par Web Crypto, est obligatoire. Rejeter les DER mal formés, les longueurs incorrectes, les entiers invalides, les surlongueurs et les signatures altérées. Importer la clé SPKI et vérifier avec `crypto.subtle.verify`.
4. Le compteur de signatures n'est **pas un critère de refus** dans cette version : les passkeys synchronisées peuvent utiliser 0 ou un compteur non strictement monotone. Documenter cette limite ; ce compteur ne prouve ni l'unicité ni la possession physique du téléphone. Les indicateurs de sauvegarde/synchronisation de credential ne permettent pas non plus de garantir qu'elle n'existe que sur un appareil.
5. Après une annulation ou un échec, Boussole reste verrouillé et affiche « Le téléphone n'a pas confirmé. Entre ton code Boussole. » Le champ PIN reçoit le focus s’il est disponible. La demande automatique est consommée jusqu’au prochain retour réel de l’arrière-plan. Choisir directement le PIN annule la demande en cours. Le budget, les essais et le délai du PIN sont conservés, y compris après un succès WebAuthn.

**Cycle de vie iOS et plusieurs onglets : règle de sécurité conservatrice :**

- États explicites `locked → device-pending → locked | unlocked` ; les autres onglets restent verrouillés. Toute nouvelle tentative, déconnexion, désactivation du verrou ou réception de `locked` depuis un autre onglet **invalide** la tentative précédente. Une réponse arrivée après invalidation ne peut jamais déverrouiller.
- Ne **pas ignorer globalement** `visibilitychange`, `pagehide`, `blur`, `focus` ou le voile de la PR A. **Pendant le dialogue système**, un simple `blur` peut provenir de l'interface Face ID : il ne doit pas à lui seul démarrer le délai d'absence ; le voile protège néanmoins ce qui est affiché. Tout véritable `document.visibilityState === 'hidden'` ou `pagehide` est enregistré et invalide le déverrouillage issu de la tentative en cours ; la page demeure verrouillée après son retour. En cas d'incertitude entre dialogue système et départ réel, **refuser le déverrouillage plutôt que d'afficher le budget** (éventuel problème de confort à mesurer sur iPhone).
- Une assertion cryptographiquement valide **n’ouvre l’interface que si** la tentative est encore active, l’état est encore `locked/device-pending`, la page est visible (`document.visibilityState === 'visible'`), aucun événement d’absence invalidant n’a eu lieu et aucune demande de verrouillage concurrente n’est plus récente. La fenêtre système peut retirer le focus à une page qui reste visible. Si une condition échoue, Boussole reste verrouillé et propose de réessayer ou d’utiliser le PIN.
- Réutiliser les protections `returnDecision` / `keepVeil` et la logique de premier rendu de la PR A : ne retirer le `privacy-veil` qu'après rendu effectif de l'écran sûr (écran PIN ou contenu autorisé), sans retour à l'« écran vert » bloquant. Pour la PR B, une réussite ne doit jamais rendre un ancien budget visible pendant une transition.
- La page WebAuthn **ne peut pas distinguer avec certitude** tous les dialogues système et départs iOS. La PR B doit échouer de manière sûre et conserver le PIN comme secours ; ne pas annoncer une compatibilité iOS/Chrome universelle avant la recette sur appareil réel.

**Domaine, appareil et disponibilité :**

- `rpId` et `origin` sont liés à l'origine autorisée ; une préversion Vercel et la production n'utilisent pas nécessairement la même identité WebAuthn. Les données locales d'origines distinctes ne sont pas automatiquement partagées ; ne pas promettre de migration de credentials ni de budget entre domaines. Choisir un domaine canonique avant l'ouverture publique reste souhaitable mais **n'est pas un P0 de cette PR**.
- Une passkey peut être synchronisée dans iCloud/Google ou utilisée sur plusieurs appareils. **Chaque installation Boussole** garde sa propre référence locale et demande une activation pour proposer le déverrouillage. Une inscription supplémentaire peut laisser d’anciens credentials dans le trousseau.
- Le résultat `isUserVerifyingPlatformAuthenticatorAvailable()` peut varier selon navigateur, OS et paramétrage. **Faux = méthode non proposée, sans dégrader le PIN**. Chrome iOS peut avoir des restrictions ; aucune affirmation d'indisponibilité générale avant test réel.
- Il n'est pas requis de supprimer automatiquement un credential du trousseau iCloud/Google : retirer sa référence locale empêche son usage par Boussole, sous réserve du modèle de menace d'un verrou purement client.

### 4.4 Déclenchement (état réel PR A, et extension PR B)

- **Existant PR A :** `components/security/LockProvider.tsx` utilise déjà `visibilitychange`, `pagehide`, `blur`, `pageshow`, `focus`, `pointerdown` et `touchstart`. `hiddenAt` est actuellement conservé en mémoire du module, **pas dans `sessionStorage`**. `lib/app-lock.ts` fournit `returnDecision` et `keepVeil`. La PR B doit prolonger ces mécanismes sans les remplacer par un second gestionnaire indépendant.
- À la perte de visibilité, `privacy-veil` est appliqué de façon synchrone. `blur` pose seulement le voile : le temps d'absence ne commence pas sans `hidden/pagehide`. Au retour, la décision de verrouiller est prise avant de dévoiler le budget. Si l'écran PIN est déjà monté, le voile peut être retiré tout de suite ; sinon il reste jusqu'au rendu effectif de `LockScreen`. **C'est la correction du bug d'écran vert de la PR A.**
- **CSS existant :** `app/globals.css:L38–49` masque `html.privacy-veil body > *` puis ajoute `body::after`. Ne pas introduire une règle sur `#app-content` ni un attribut `data-locked` qui n'existent pas dans le code.
- **Extension PR B :** les signaux intervenant pendant `device-pending` suivent la machine à états du §4.3. Les signaux continuent d'être enregistrés et le voile continue de protéger l'écran. Un dialogue système ne doit jamais permettre un déverrouillage tardif après `hidden/pagehide` ou après un verrouillage concurrent.
- Au lancement à froid, un PIN existant (valide ou illisible) verrouille l'application ; les délais s'appliquent ensuite aux retours dans l'app. Le masquage de l'aperçu par iOS **n'est pas garanti** même si le voile fonctionne ; l'utilisateur peut verrouiller manuellement avant de quitter.

### 4.5 Code oublié (S2, C10, C13)
L’accès à la messagerie **ne suffit jamais** à afficher le budget local.
1. Si le déverrouillage par le téléphone est actif et valide : le proposer. **Ce moyen ne réinitialise pas le PIN** ; il permet seulement d'ouvrir temporairement l'interface. Pour changer le PIN oublié, appliquer la procédure d'effacement/restauration déjà prévue.
2. **Avec compte** : « Effacer ce téléphone et récupérer mon budget en ligne ».
   - Avant d’effacer, sans rien afficher du budget, Boussole indique si des modifications de ce téléphone ne sont pas encore en ligne (comparaison d’empreintes, §6.2) : « Les modifications faites sur ce téléphone depuis le <date> seront perdues. »
   - Effacement local complet (§6.3), puis connexion par code e-mail **et** saisie de la phrase secrète, puis récupération du coffre.
3. **Sans compte** : « Effacer Boussole sur ce téléphone », puis, si la personne a un fichier de sauvegarde, « Restaurer une sauvegarde » (page existante). Utilise la primitive `eraseLocalData()` (§6.3), livrée dès la PR A.

Confirmation de tout effacement depuis l’écran verrouillé : écran dédié expliquant ce qui sera supprimé, puis saisie du mot « EFFACER ». Limite écrite : « Une personne qui tient ton téléphone peut aussi supprimer Boussole depuis les réglages du téléphone. Le verrou protège tes informations, pas leur conservation : garde une sauvegarde ou un compte. »

Réseau absent ou copie en ligne inaccessible (cas avec compte) : Boussole n’affirme jamais que les modifications sont en ligne. Message : « Impossible de vérifier ta copie en ligne. Si tu effaces maintenant, les modifications faites sur ce téléphone depuis ta dernière synchronisation réussie (<date>) peuvent être perdues. »
Avertissement à l’activation du verrou sans compte ni déverrouillage par le téléphone : « Sans compte, un code oublié oblige à effacer le budget de ce téléphone. Garde une sauvegarde ou crée un compte. »

### 4.6 Plusieurs onglets (S6)
- Canal `BroadcastChannel('boussole-security')` (repli : événement `storage` sur la clé `boussole-security-event`).
- **Existant PR A** (`lib/security-channel.ts`) : événements `locked`, `lock-enabled`, `lock-settings-changed`, `local-erased`. Le verrouillage se propage, tandis que le déverrouillage par PIN/WebAuthn reste propre à chaque onglet.
- **PR B :** réutiliser `lock-settings-changed` pour l'activation/désactivation de la méthode téléphone ; garder le même verrouillage inter-onglets. Si `locked` survient pendant un dialogue WebAuthn, invalider la tentative.
- **C0** signale les transitions de compte entre onglets. Chaque onglet relit l’état partagé avant de rendre le budget ou de lancer une écriture (§7.4). **D** ajoute le gel et la reprise de la déconnexion prouvée.

---

## 5. Premier lancement et création de compte

**Lot C1**, dans une PR séparée après la fusion de C0 (§7 et §9.5). La connexion aux comptes existants utilise `shouldCreateUser: false`. Le parcours **Créer mon compte** demande explicitement la création. Son ouverture aux utilisateurs exige l’expéditeur Boussole du §5.6.

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

1. Après l’OTP, C0 valide le compte et le cas d’association. Pour un premier budget, l’appareil doit être vide et l’absence de coffre confirmée par une lecture réussie. La phrase secrète est confirmée selon le §5.2.
2. `finishOnboarding` retourne l’`AppState` effectivement persisté après les trois questions. Sous le verrou de transition (§7.4), écrire `boussole-vault-pending-v1` dans `localStorage` avec `{userId, fingerprints}`, dont la première entrée désigne l’instantané local effectivement sauvegardé. Écrire le marqueur avant de publier le rattachement final et avant tout `INSERT`. Ajouter la clé à `LOCAL_STORAGE_KEYS` et la conserver si l’effacement du budget échoue.
3. `createInitialVault` utilise l’instantané sauvegardé et `accountGuard` avant `createVault`. Tant que le marqueur existe, `runSync` s’arrête dès son entrée, avant toute requête, même après rechargement, retour du réseau, retour au premier plan ou appui sur « Synchroniser maintenant ». Relire le marqueur avant toute écriture ordinaire déjà préparée dans un autre onglet. Au démarrage et au début d’une association, retirer sous le verrou de transition un marqueur qui ne correspond plus à un propriétaire `account` ou `transition` du même compte. Ce nettoyage permet de reconfirmer l’association si l’app s’est interrompue alors que le propriétaire était encore invité. Le parcours de reprise de l’étape 4 traite la création en attente.
4. En cas d’échec ou de réponse perdue, garder le budget local et proposer **Réessayer** au même compte. Au rechargement ou à la reprise, vérifier le compte, la clé et le marqueur, puis relire le coffre.
   - Si le propriétaire est un compte et que le marqueur est illisible, reprendre avec une liste vide pour ce compte. La synchronisation ordinaire reste suspendue.
   - Si une lecture réussie confirme l’absence du coffre, refaire l’`INSERT` à partir du budget local actuel. Avant cet envoi, ajouter au marqueur l’empreinte de l’instantané réellement envoyé et garder les dix dernières empreintes distinctes. Si `createVault` renvoie `null` (`23505`), relire le coffre et appliquer la comparaison ci-dessous.
   - Si le coffre existe et que ses paramètres de dérivation diffèrent de ceux de la clé locale, garder le marqueur et demander la phrase secrète du coffre distant. Reprendre la comparaison après avoir dérivé la clé avec les paramètres du coffre.
   - Déchiffrer le coffre et comparer son empreinte à celle du budget local actuel et aux empreintes du marqueur. Une égalité confirme la création, y compris si une insertion précédente a abouti pendant la relance. Si seule une empreinte du marqueur correspond, garder les modifications locales pour le prochain envoi normal. Si aucune empreinte ne correspond, afficher un choix explicite et conserver les deux copies jusqu’à sa résolution.
   - Après un `INSERT` confirmé ou une comparaison concluante, revérifier le compte et le marqueur sous le verrou de transition. Enregistrer dans la mémoire de synchronisation la version et l’empreinte **du coffre confirmé**, puis retirer le marqueur seulement si cet enregistrement a réussi. La synchronisation ordinaire peut alors reprendre et envoyer les modifications intervenues depuis la création. La reprise de création utilise uniquement `INSERT` pour ses écritures distantes.
5. Afficher « Copie en ligne créée » seulement après confirmation, puis proposer le verrou. Une erreur ou un coffre qui ne peut pas être relu ou déchiffré maintient la création en attente.

### 5.4 Sans compte (C12)
Après les trois questions, l’écran de résultat (`OnboardingResult`) propose aussi « Verrouiller Boussole avec un code ? ».

### 5.5 Personnes existantes
Les parcours sans compte restent disponibles. « Plus → Compte et sécurité » propose « Créer un compte pour ce budget » pour un budget invité. La personne confirme l’instantané à associer après identification du compte (§7, cas A). Le marqueur et la reprise du §5.3 s’appliquent à ce premier coffre.

### 5.6 E-mail d’authentification et environnement de test

La recette technique peut s’exécuter sur une instance Supabase locale isolée avec Mailpit, comme pour C0. Le modèle en français contient `{{ .Token }}` pour transmettre le code numérique. Vérifier la consommation et l’expiration de l’OTP. Pour une recette d’envoi sur un projet de test hébergé, utiliser `connexion@mail.startonlab.be` via le domaine signalé vérifié dans Resend et vérifier le raccordement SMTP ou Supabase–Resend. [SMTP Supabase](https://supabase.com/docs/guides/auth/auth-smtp) · [Modèles d’e-mails Supabase](https://supabase.com/docs/guides/auth/auth-email-templates)

Pour ouvrir C1 aux utilisateurs, choisir le domaine définitif et vérifier la réception des OTP en production avec un expéditeur au nom de **Boussole** sur un domaine identifiable comme le sien. Ce choix conditionne l’ouverture de C1. C0 peut être livré avant cette mise en place.

Utiliser un projet Supabase isolé avec des comptes et des budgets fictifs. Avant les tests d’intégration, relever la référence du projet et obtenir une preuve que la migration `20261120091727_budget_vaults.sql` y est appliquée. Tester les politiques d’accès avec deux comptes jetables et les identifiants publics de l’environnement de test. Le fichier de migration est présent dans le dépôt. Sa présence ne démontre pas l’état de la base distante. La configuration de production et la livraison des e-mails à de vrais utilisateurs sont validées séparément avant ouverture.

### 5.7 Accès local quand la session ou le rattachement pose problème

**Session propriétaire expirée hors ligne.** Dès le démarrage, relire la session précédemment établie par Supabase sur cet appareil, le propriétaire lu dans `boussole-budget-owner-v1` et la clé de synchronisation locale. Si la session a expiré et que les trois désignent le même compte, le contrôle de compte autorise immédiatement l’accès local au budget, export compris. Lancer le renouvellement en arrière-plan. L’accès local ne dépend pas de la fin de ses tentatives réseau. Le verrou PIN ou téléphone et les contrôles de stockage s’appliquent.

- Utiliser `isAuthRetryableFetchError(error)` pour reconnaître l’échec réseau du renouvellement et conserver l’accès local. Toute autre erreur maintient le budget masqué ou le remasque. Suspendre les opérations sur le coffre pendant cet accès local. Au retour du réseau, revalider la session auprès de Supabase et relire le propriétaire et la clé avant de reprendre la synchronisation.
- Une révocation, un refus de renouvellement par Supabase, une session fermée ou modifiée dans un autre onglet, une clé manquante ou un propriétaire différent gardent le budget masqué ou le remasquent. Relire les trois identités avant d’appliquer une réponse tardive pour que la vérification d’un compte ne puisse pas ouvrir le budget sous un autre.

**Rattachement illisible.** Quand la clé de propriétaire existe et contient une valeur invalide, récupérer le budget en mode invité après confirmation de l’absence de session. Sous le verrou `boussole-account-transition`, relire l’absence de session dans le stockage et l’état du propriétaire. Si l’absence est certaine et la valeur toujours invalide, effacer l’ancienne mémoire de synchronisation, retirer toute clé de synchronisation active en mémoire, puis écrire `{type: 'guest'}`. Rendre le budget visible et exportable via le contrôle de compte habituel. Le contenu du budget et les sauvegardes restent intacts.

- Une session présente ou incertaine, une erreur d’accès au stockage, un propriétaire valide, un marqueur de transition valide ou l’impossibilité de prendre le verrou maintiennent le contrôle de compte habituel. L’échec réseau du renouvellement ne confirme jamais l’absence de session.

---

## 6. Déconnexion prouvée (C2, C3, C7, C8, C9, D5)

### 6.1 Déroulé de « Se déconnecter »
1. **Gel** : écran bloquant « Déconnexion en cours » ; envoi `signing-out` aux autres onglets ; annulation du minuteur d’envoi automatique (1,5 s) ; attente de la fin de toute synchronisation en cours (`busy` dans `CloudSyncProvider`).
   - Pose de la clé `boussole-session-closing` (horodatée) dans `localStorage`. Tant qu’elle existe, **tout onglet** refuse les écritures du budget et les synchronisations (contrôle ajouté à l’entrée de `saveBudget`, de l’effet d’enregistrement d’`AppContext` et de `runSync`), y compris un onglet qui se réveille sans avoir reçu le message.
   - Après l’effacement, un onglet resté ouvert ne peut pas réécrire l’ancien budget : `writeBudgetSnapshot` (`lib/budget-state.ts` L23–42) refuse déjà toute écriture quand le contenu stocké a changé depuis sa lecture (ici : supprimé).
   - La clé `boussole-session-closing` est supprimée en dernier, une fois la session fermée. Après une interruption, Boussole conserve le gel et ne reprend la preuve qu’après avoir vérifié le compte propriétaire et l’instantané prévu (§7.4).
2. **Envoi** : une synchronisation réservée à la déconnexion du compte propriétaire sur l’instantané gelé (§7.4). La synchronisation ordinaire reste bloquée.
3. **Preuve** (§6.2).
4. Preuve obtenue, revérifier le compte et l’instantané gelé. Fermer la session avec `auth.signOut({ scope: 'local' })` avant de retirer les données locales de session. Si la fermeture échoue, conserver le budget. Après confirmation de la fermeture, effacer et vérifier les données locales (§6.3) sous le même gel, puis signaler la fin de la transition et revenir à l’écran de choix.
5. Preuve impossible → déconnexion **bloquée**. Message : « Ton budget n’a pas pu être vérifié en ligne. Rien n’a été effacé. » Choix :
   - « Réessayer » ;
   - « Rester connecté » ;
   - « Me déconnecter sans effacer ce téléphone » : avertissement « Ton budget restera sur ce téléphone, sans compte. Toute personne qui ouvre Boussole sur ce téléphone pourra le voir, sauf si le verrou est actif. » Cette option du lot D demande une confirmation séparée par le compte propriétaire. Après fermeture de la session, une transition autorisée rend le budget invité et efface la mémoire de synchronisation. Une reprise interrompue maintient le budget masqué tant que la transition reste incertaine.
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
`eraseLocalData()` (`lib/account-lifecycle.ts`), **livrée dans la PR A** et réutilisée par la déconnexion :
1. `localStorage` : supprimer les données applicatives répertoriées par `eraseLocalData`, dont le budget et son rattachement, puis vérifier l’absence de chaque donnée. Conserver le marqueur partagé de déconnexion jusqu’à la fin de la transition.
2. IndexedDB `boussole-cloud` : suppression des clés, **avec propagation des erreurs** (à corriger dans `clearStoredKey`, qui les ignore aujourd’hui), puis relecture pour vérifier l’absence.
3. État en mémoire remis à zéro (rechargement de la page après la déconnexion).
Wording : « supprimé de Boussole sur ce téléphone », jamais « effacement sécurisé » (C7 : le navigateur ne garantit pas l’effacement physique).
Échec d’une étape : « L’effacement n’est pas complet. » + « Réessayer ». Jamais de message de succès après un effacement partiel.

### 6.4 Déconnexion non demandée (C3)
C0 traite la session expirée, révoquée ou fermée ailleurs (`SIGNED_OUT`). Le budget et son rattachement sont conservés, masqués et protégés contre toute écriture de session. Si le verrou PIN est actif, le verrou existant reste prioritaire. L’écran de compte indique « Tu n’es plus connecté. Reconnecte-toi à ton compte pour retrouver ton budget. » C1 ajoute l’accès local du §5.7 en cas d’expiration avec échec réseau. Pour une session révoquée ou fermée, une reconnexion vérifiée au compte propriétaire est requise. Le cas d’un autre compte suit le §7.

### 6.5 Suppression du compte (C5)
Parcours séparé de la déconnexion :
1. Confirmation : « Le compte et la copie en ligne seront supprimés définitivement. »
2. `deleteCloudAccount()`.
3. Choix local : « Garder mon budget sur ce téléphone, sans compte » ou « L’effacer aussi » (§6.3).
Aucune preuve de synchronisation n’est demandée : la copie en ligne est volontairement supprimée.

---

## 7. C0 — Association du budget et changements de compte (C4)

### 7.1 Vacuité et rattachement local

`isPristineBudget` compare le budget complet sérialisé à `serializeBudget(emptyBudgetState)` et vérifie l’absence de la clé `boussole-budget-v1`, même si la version 2 existe. Le prénom, la réserve, les documents, la médiation et les données P3 comptent aussi. Un stockage illisible, en chargement ou comportant des modifications non persistées impose d’attendre ou de réparer le stockage. Il ne vaut jamais budget vide.

Enregistrer le propriétaire dans la clé `localStorage` **`boussole-budget-owner-v1`**. La valeur est un objet JSON `{type: 'guest'}` ou `{type: 'account', userId}`. Ajouter la clé à `LOCAL_STORAGE_KEYS` pour les parcours d’effacement explicitement confirmés. Elle reste séparée de l’enveloppe v2, de `serializeBudget`, des empreintes et du coffre. Une édition ordinaire, une déconnexion simple ou la perte du trousseau ne change pas cette clé. Une valeur présente mais illisible maintient le budget masqué et intact jusqu’à la récupération prévue en C1 au §5.7.

Un budget présent sans clé de propriétaire devient un budget **invité**. Au premier lancement de C0, sous le verrou du §7.4, retirer la mémoire `boussole-sync-v1` et toute ancienne session locale `boussole-auth` avant d’enregistrer le propriétaire invité et d’initialiser Supabase. Le budget et les sauvegardes restent intacts, consultables et exportables hors ligne. Un premier budget créé en mode local est aussi marqué invité.

La vérification du 21 novembre 2026 a compté zéro compte et zéro coffre sur le projet Supabase de production. Une ancienne mémoire peut donc désigner un compte de test devenu inaccessible. Seule la clé de propriétaire créée par C0 établit le rattachement du budget.

### 7.2 Blocage global avant l’OTP et le chargement de la clé

Pendant l’amorçage, avant la vérification de l’OTP ou dès réception d’un changement de compte, masquer le budget jusqu’à ce que la session, la clé et le propriétaire soient résolus. `AccountGate` utilise la décision du §7.4. Il affiche le choix d’association si nécessaire, en restant bloquant tant que le choix manque.

Composer `AppProvider → CloudSyncProvider → LockProvider → AccountGate → contenu` dans `AppWrapper`. Le verrou PIN ou téléphone reste prioritaire. Dès que ce verrou s’ouvre, `AccountGate` affiche l’écran de connexion, d’association ou de récupération si le budget reste protégé. Il ne monte pas les pages budgétaires, l’en-tête ni la navigation dans cet état. Ce test s’applique aussi au premier rendu, à l’hydratation et à un accès direct à `/dashboard`, `/analyse` ou `/sauvegarde`.

Les lectures en ligne nécessaires sont limitées au compte actif. Distinguer `inconnu`, `absent` et `présent` pour le coffre. Seule une lecture réussie peut conclure à son absence. Une erreur réseau, une phrase erronée ou une clé liée à un autre compte maintient le contrôle en place. En mode invité, l’app reste utilisable hors ligne. Pour le propriétaire, C1 traite l’expiration hors ligne et la reprise de la synchronisation selon le §5.7. La désactivation de la configuration cloud ne transforme pas un budget rattaché en budget invité.

### 7.3 Décisions d’association

Une décision indique le compte, la provenance du budget, l’instantané local et l’état confirmé du coffre. Une intention ouverte avant l’OTP ne suffit pas. La confirmation est recueillie après identification du compte. Si le budget, le compte ou la version du coffre changent entre l’affichage du choix et sa validation, relire l’état et demander une nouvelle décision.

| Cas | Choix autorisé |
|---|---|
| **A.** Créer un compte pour un budget invité identifié, coffre absent | En C1, confirmer explicitement le compte et le budget à associer, puis créer le coffre à partir de l’instantané accepté. |
| **B.** Budget invité non vide, compte existant sans coffre | « Associer ce budget à mon compte », « Commencer avec un budget vide » après confirmation explicite, ou « Annuler ». |
| **C.** Budget invité non vide, compte avec coffre | « Remplacer ce budget par celui de mon compte » après confirmation, ou « Annuler ». Déchiffrer et valider le coffre avant de remplacer le budget local. |
| Budget local vide, sans rattachement à un autre compte | Récupérer le coffre du compte vérifié après validation de la clé si le coffre existe. Sinon, autoriser le premier budget (§5.3 pour C1). |
| Budget rattaché au compte actif | Autoriser la reprise normale après vérification de la session et de la clé. Le moteur existant traite les modifications et conflits du budget. |
| Budget rattaché à A, session absente ou compte B | Masquer et conserver le budget. Proposer de revenir au compte A. B ne peut ni associer, ni remplacer, ni effacer le budget de A depuis l’association. Cette règle vaut même si le budget de A est vide. |

« Annuler » conserve le budget, son rattachement et le coffre. Pour un budget invité, l’annulation rend le mode local après confirmation de fermeture de la session en cours. Pour un budget rattaché, l’écran de compte reste en place jusqu’à vérification du propriétaire.

### 7.4 Contrôle de compte et verrou de transition

```text
accountGuard({ sessionUserId, keyUserId, owner }) → autorisé | masqué
```

En mode invité, l’accès est autorisé quand l’absence de session et de clé active est confirmée. Pour un budget rattaché, le propriétaire, le compte de la session et celui de la clé utilisée doivent correspondre. Les autres cas restent masqués. L’accès invité permet les opérations locales. Une opération de coffre exige un compte vérifié et sa clé. En C1, le secours hors ligne conserve le même contrôle d’identité pour l’accès local et suspend toute opération de coffre jusqu’à la validation de la session en ligne (§5.7).

Appliquer ce contrôle dans `AccountGate`, au début de `runSync`, juste avant `createVault` et `updateVault`, et avant tout remplacement local par récupération distante, résolution de conflit ou restauration. Les commandes d’édition et l’export local restent bloqués quand le budget est masqué. Relire la session active et le propriétaire au point d’écriture, même après un retour de l’arrière-plan. Pour un résultat asynchrone, `keyUserId` désigne la clé utilisée par cette opération. Ainsi, un résultat lancé sous A reste refusé dès que l’identité active ne correspond plus, même si une clé B est déjà chargée. Vérifier aussi ce contrôle avant de retenir la clé chargée ou de mettre à jour la mémoire de synchronisation. Une requête déjà partie reste liée au compte et au jeton de départ, avec la RLS et le contrôle de version du coffre.

Utiliser **`navigator.locks.request('boussole-account-transition', …)`** uniquement pour les transitions de compte, dont l’initialisation du propriétaire, l’association et le détachement. Sous le verrou, relire le propriétaire source, la session et l’instantané. Un choix explicite du §7.3 peut engager un changement du propriétaire invité vers le compte confirmé. Avant un remplacement dans ce cas, contrôler aussi la correspondance entre ce compte et la clé de l’opération. Réutiliser `writeBudgetSnapshot` pour refuser l’écriture si l’instantané local a changé.

Si une transition modifie à la fois le budget et son propriétaire, utiliser un marqueur `{type: 'transition', userId}` dans **la même clé** pendant les deux écritures. `accountGuard` le traite comme masqué. Publier le propriétaire final après réussite. Après une interruption, conserver les données présentes et reprendre la décision sous le même verrou avec le compte indiqué. Le marqueur ne change jamais la règle de migration d’une clé absente. Si le verrou est indisponible, garder les transitions en attente et conserver l’accès des budgets invités hors session.

En C0, `signOut` conserve le budget et son propriétaire. Relire le propriétaire et la session après chaque événement de compte et au premier plan. L’effacement d’urgence de la PR A garde sa confirmation « EFFACER ». Le lot D ajoute la déconnexion avec preuve et le détachement volontaire (§6).

---

## 8. Fichiers touchés

| Lot | Fichiers et responsabilités |
|---|---|
| A et B, livrés | Verrou PIN et WebAuthn sous `components/security/`, `lib/app-lock.ts`, `lib/webauthn-lock.ts`, `lib/device-lock-storage.ts` et tests associés. |
| C0 | `AccountGate` dans `AppWrapper.tsx`, écran de compte, `accountGuard` et clé de propriétaire dans `lib/`. Appeler la garde depuis `CloudSyncProvider.tsx` et `AppContext.tsx`. Ajouter la clé à `LOCAL_STORAGE_KEYS`. |
| C1 | `AccountChoice`, `BudgetOnboarding.tsx`, `lib/passphrase.ts`, `finishOnboarding` dans `AppContext.tsx`, création initiale du coffre, accès hors ligne et récupération du rattachement (§5.7). |
| D | `SignOutFlow`, `lib/account-lifecycle.ts` pour la preuve et l’ordre des opérations, `CloudSyncProvider.tsx`, et propagation des erreurs de trousseau dans `lib/cloud-remote.ts`. |

Les lots C0 et C1 réutilisent le format du coffre, le chiffrement et les politiques RLS présents dans le dépôt. Leurs changements portent sur l’application et le stockage local. Documenter les parcours livrés dans `docs/audit/README.md`.

---

## 9. Tests

### 9.1 Unitaires (`npm test`)
1. Code : bon accepté, mauvais refusé, sels différents → hachages différents, aucune trace du code dans l’enregistrement.
2. Essais : 5 échecs → 30 s ; 6ᵉ → 60 s ; plafond 15 min ; succès → remise à zéro ; état conservé après relecture du stockage.
3. `shouldLock` : délai 0, 60 s, 300 s ; retour à 59 s, 60 s, 61 s.
4. `generatePassphrase` avec générateur injecté : format exact ; octets ≥ 248 rejetés (séquence d’entrée connue → sortie connue) ; les 31 symboles atteignables ; entropie théorique 99,1 bits ; la fonction par défaut utilise `crypto.getRandomValues`.
5. WebAuthn : tests indépendants de **l'inscription et de l'assertion**, avec fixtures de CBOR/authenticatorData et signatures ES256 encodées DER (production possible via `node:crypto`), puis DER→P1363 vérifié. Positive : inscription UP/UV/AT correcte, credential ID/rpIdHash/clé/algorithme cohérents ; assertion valide et compteur de signature 0 accepté. Négatifs **indépendants** : `challenge` différent ou rejoué ; `origin` différente ; `crossOrigin:true` ; `type` faux ; RP ID invalide ; UP=0 ou UV=0 ; credential ID inconnu ; clé remplacée ; signature altérée ; erreur d'algorithme ; DER mal formé, tronqué, entier négatif ou surlongueur ; données d'inscription incohérentes ; absence de clé publique. Une réponse de tentative abandonnée/ancienne est toujours rejetée.
6. `accountGuard` couvre la concordance ou la divergence entre session, clé et propriétaire, l’accès invité hors session et la clé de propriétaire illisible ou en transition. Vérifier la migration avec et sans mémoire, `isPristineBudget` et les décisions du §7.3.
7. `proveSynced` : identique → preuve ; une dépense de plus en local → pas de preuve ; copie en ligne plus récente que le local → pas de preuve ; mauvaise phrase → erreur, pas de preuve.
8. `signOutSteps` : preuve → effacement ; sans preuve → blocage, aucun effacement ; échec simulé de la suppression IndexedDB → « effacement incomplet », pas de succès.

### 9.2 Navigateur (Playwright, build de production, 390 × 844)
9. Premier rendu verrouillé : aucun montant dans le DOM avant, pendant et après l’hydratation (capture du DOM à chaque étape).
10. Deux onglets : verrouiller l’un → l’autre verrouillé ; déconnecter dans l’un → l’autre bloqué puis rechargé, sans budget affiché.
11. Déconnexion de A puis connexion de B sans recharger : aucune donnée de A visible ni envoyée vers le coffre de B (vérification du coffre de B).
12. Déconnexion non demandée simulée dans un autre onglet. Le budget et le rattachement sont conservés, la session est bloquée, le budget est masqué et la reconnexion au compte propriétaire est proposée.
13. Ajout d’une dépense puis « Se déconnecter » dans la seconde suivante : la dépense est dans la copie en ligne ou la déconnexion est bloquée ; jamais perdue.
14. « Se déconnecter » pendant une synchronisation en cours : attente puis preuve, ou blocage.
15. Réponse réseau perdue après une écriture réussie (requête Supabase interceptée, réponse supprimée) : pas de faux conflit, preuve obtenue au second essai.
16. Création du premier budget. Le coffre contient exactement l’état retourné par la persistance locale et se récupère sur un second navigateur. L’insertion est pilotée par le parcours, sans temporisation ni course avec l’envoi automatique.
17. Association d’un budget invité avec un compte sans coffre (cas B) ou avec coffre (cas C). Compter les requêtes `POST`, `PATCH` et `DELETE` vers `budget_vaults` avant le choix. L’attendu est zéro. Vérifier aussi que le budget local reste inchangé.
17 bis. Budget contenant **uniquement** une étape de médiation, ou uniquement un document, ou uniquement un prénom : jamais considéré comme vide, jamais remplacé sans choix.
17 ter. Pendant l’association, navigation directe vers `/dashboard`, `/analyse` et `/sauvegarde`. Aucun montant, document ou libellé du budget dans le DOM du premier rendu à la résolution. Les mutations locales et l’export sont bloqués.
18. Code oublié avec compte : impossible d’afficher le budget local sans effacement préalable ; après effacement, récupération exigeant code e-mail **et** phrase secrète.
19. Suppression du compte : parcours complet, sans blocage, choix local respecté.
20. WebAuthn avec authentificateur virtuel Chromium (CDP `WebAuthn.addVirtualAuthenticator`, `hasUserVerification:true` puis `false`) couvre l’activation par clic avec le PIN existant, le déverrouillage, le refus sans UV, le secours PIN après suppression du credential (`removeCredential`), l’annulation et la tentative double. Le changement de PIN conserve l’option, sa désactivation retire la référence et l’effacement supprime les deux clés. Le PIN reste lisible si `boussole-lock-device-v1` est corrompu et son délai d’attente survit à un succès WebAuthn. Si le navigateur annonce la méthode indisponible alors qu’elle est configurée, le bouton est masqué, le champ PIN reçoit le focus et la référence est conservée.
20 bis. Les parcours Playwright de `tests/browser/lock-webauthn.mjs` vérifient la demande automatique au lancement, l’annulation avec focus sur le PIN et le retour de l’arrière-plan qui lance exactement une demande. Ils vérifient aussi que le cadenas manuel et la sélection du PIN gardent leur effet.
21. Verrou proposé après un premier budget sans compte.
22. Retour après 59 s, 60 s, 61 s avec un délai d’une minute ; redémarrage du navigateur → verrouillé.
22 bis. Retour au premier plan après le délai : captures du DOM et de la page à chaque image entre le retour `visible` et l’affichage de l’écran verrouillé ; aucune ne montre de montant.
22 ter. Deux onglets dont un suspendu (émulation de gel du processus) ; verrouillage dans l’autre ; réveil de l’onglet suspendu : aucun budget visible.
22 quater. Code oublié sans compte : aucune suppression sans la saisie « EFFACER » ; après suppression, toutes les clés locales absentes et l’écran de choix affiché.
22 quinquies. Synchronisation en cours dans un onglet, déconnexion dans l’autre : aucune dépense perdue, aucun ancien budget réécrit après l’effacement.
23. `privacy-veil` présente pendant `hidden` (test technique seulement, voir 9.3).
24. axe-core : 0 violation sur l’écran de choix, la phrase secrète, le verrouillage, les réglages, l’association, la déconnexion bloquée.
Les scénarios d’intégration 11 à 19 sont exécutés sur le **projet Supabase de test isolé** du §5.6 avec des comptes fictifs. Les scénarios unitaires et les simulations navigateur couvrent les mêmes blocages indépendamment de ce projet.

### 9.3 Recette manuelle sur appareils (avant fusion, captures à l’appui)
Sur iPhone, tester **Safari, Chrome iOS et la PWA installée**. Sur Android, tester Chrome et la PWA si un appareil est disponible. Avec le délai « Immédiatement », vérifier dans Safari et la PWA que la fenêtre système apparaît seule après un retour et après fermeture de l’onglet ou de l’app. Vérifier que Face ID déverrouille du premier coup, qu’un échec suivi du **code du téléphone** ouvre le budget et qu’une annulation affiche le PIN sans rouvrir la fenêtre. Lors d’une sortie réelle pendant le dialogue, le budget reste masqué et le retour présente le verrou sans voile bloqué. Vérifier la disponibilité dans Chrome iOS sur la préversion. Une méthode indisponible laisse le PIN utilisable. Après suppression de la passkey dans le trousseau, vérifier le secours PIN puis la désactivation et la réactivation dans les réglages. Vérifier aussi le changement de PIN, la réinstallation de la PWA et l’accès depuis un second appareil. Consigner les résultats et limites des essais physiques dans la page Confidentialité.

### 9.4 Preuves minimales spécifiques à la PR B

- **Précondition.** La suite de tests présente sur `main` reste verte. Les tests WebAuthn couvrent aussi les transitions de navigateur et les réponses tardives.
- **Stockage.** `boussole-lock-v1` de la PR A fonctionne sans migration. Une référence WebAuthn absente, altérée ou incompatible préserve le PIN et le solde. Une nouvelle référence est écrite après validation. Pour remplacer une référence valide, la désactivation précède la réactivation et le PIN reste utilisable si celle-ci est annulée. Désactiver le verrou PIN ou effacer Boussole retire la référence WebAuthn et vérifie son absence.
- **Concurrence.** Une seule tentative peut être en cours par onglet. Le message `locked` d’un autre onglet invalide la tentative. Une assertion valide peut être acceptée après un simple `blur` si la page est toujours visible. Un `visibilitychange:hidden` ou `pagehide` invalide la tentative même si la signature renvoyée est valide. Au retour, le budget reste masqué et le voile laisse le PIN accessible.
- **Secours :** si la méthode téléphone devient indisponible, le PIN déverrouille ; une annulation WebAuthn ne consomme aucun essai PIN ; un succès WebAuthn ne remet pas le compteur PIN à zéro ; perte/oubli de PIN n'est jamais « réparé » automatiquement par WebAuthn.
- **Distinction des preuves :** Node démontre la logique cryptographique ; Chromium virtuel démontre la logique de navigateur simulé ; **seul un essai physique** valide les fenêtres système, leur effet sur la visibilité, le comportement Chrome iOS, et la PWA.
- **Gate de fusion PR B :** pas de fusion si une méthode autorisée ouvre l'application sans UV/signature valide, si le PIN devient inutilisable, si le budget apparaît au mauvais moment, ou si les tests iPhone requis restent non réalisés. Une indisponibilité WebAuthn propre à un navigateur peut être acceptée si l'option y est masquée, le PIN fonctionne et la limitation est communiquée.

### 9.5 Conditions de validation de C0 et C1

| Lot | Scénario | Attendu |
|---|---|---|
| C0 | A est connecté. Déconnexion, session expirée ou passage à B, dans le même onglet puis sur deux onglets. Tester B sans coffre et B avec coffre. | Le budget de A reste intact et masqué. Aucun transfert à B, aucun remplacement et aucune écriture autorisée par B. La reconnexion vérifiée à A rétablit l’accès. |
| C0 | Association en attente. Déclencher une modification différée, un retour visible, un retour réseau, une synchronisation manuelle et une résolution de conflit. | Zéro écriture vers le coffre et zéro mutation du budget local avant le choix. Aucun contenu budgétaire dans le DOM. Les lectures autorisées sont limitées au compte actif. |
| C0 | Changer de compte dans un onglet avant une écriture déjà préparée dans l’autre. Vérifier aussi après retour de l’arrière-plan. | La relecture du propriétaire et de la session au point d’écriture bloque l’opération préparée pour l’ancien compte. Le budget reste masqué tant que le compte ne correspond pas. |
| C0 | Connexion sur budget invité, compte sans coffre puis compte avec coffre. Tester la confirmation, l’annulation, une lecture distante en échec et un changement de budget entre choix et confirmation. | La matrice du §7.3 s’applique. La lecture en échec reste d’état inconnu. Aucun envoi ni remplacement sans décision valide sur le même instantané. |
| C0 | Ancien budget avec une mémoire A et une ancienne session, puis ancien budget sans mémoire. Clé propriétaire présente mais illisible ou transition locale interrompue. | En l’absence de clé de propriétaire, le budget devient invité et reste visible et exportable hors ligne. L’ancienne mémoire et l’ancienne session sont retirées. Si la clé de propriétaire est illisible ou marque une transition interrompue, le budget reste intact et masqué jusqu’à résolution. |
| C0 | Budget vierge, fichier legacy seul ou encore présent avec la v2, données limitées au profil, à la médiation, aux documents ou à P3. Stockage illisible. | Seul le budget complet vierge sans fichier legacy est déclaré vide. |
| C1 | Premier budget avec OTP et phrase confirmée. Perdre la réponse après insertion, modifier une dépense, puis recharger. Déclencher aussi le retour au premier plan, le retour du réseau et la synchronisation manuelle. Vérifier le comportement avant et après la confirmation. | Le marqueur survit au rechargement. Après rechargement et avant confirmation, aucune création hors du parcours de reprise et aucune mise à jour du coffre. La comparaison avec l’empreinte du marqueur confirme le coffre sans faux conflit. La version et l’empreinte confirmées sont enregistrées avant le retrait du marqueur. La synchronisation normale transmet ensuite la dépense modifiée. |
| C1 | Relancer après une lecture qui confirme l’absence du coffre, puis laisser le premier envoi aboutir avant le second `INSERT`. Refaire avec un coffre différent créé sur un second appareil, avec un autre sel. | Sur `23505`, relire et comparer. Une empreinte précédente confirme le premier envoi. Avec un sel différent, demander la phrase et reprendre la comparaison. Si aucune empreinte ne correspond, les deux copies restent intactes jusqu’au choix explicite. La reprise n’émet aucune mise à jour distante. |
| C1 | Interrompre l’association après l’écriture du marqueur et avant celle du propriétaire. Recharger et reconfirmer le choix. Tester aussi un marqueur illisible avec un propriétaire de compte, et un coffre absent, identique ou différent. | Le propriétaire invité peut reconfirmer l’association. Pour un propriétaire de compte, la reprise sans empreinte connue crée le coffre après confirmation de son absence, reconnaît un coffre égal au budget actuel ou demande un choix pour un coffre différent. |
| C1 | Mode invité pendant la coupure réseau, retour avec et sans compte, confirmation de la phrase générée. | Le parcours invité reste disponible et le parcours compte exige la confirmation de sauvegarde de la phrase. Le compte reçoit seulement le budget qui lui a été associé. |
| C1 | Connecter A, charger sa clé, laisser expirer le jeton, couper le réseau et recharger. Retarder la réponse de renouvellement, puis renvoyer une erreur reconnue par `isAuthRetryableFetchError`. Rétablir le réseau, une fois avec renouvellement réussi, une fois avec un refus de Supabase. | A consulte et exporte le même budget avant la réponse du renouvellement et garde cet accès après l’erreur réseau. Zéro opération de coffre jusqu’à la validation en ligne de A. Un refus maintient la suspension et remasque le budget. |
| C1 | Répéter l’expiration hors ligne en retirant la clé de A, ou en fermant ou remplaçant sa session depuis un autre onglet pendant une vérification en attente. | Le budget de A reste masqué ou est remasqué. La réponse tardive ne rend pas l’accès ni ne déclenche de synchronisation. |
| C1 | Introduire une valeur de propriétaire invalide sans session. Refaire avec une session active ou incertaine, un stockage inaccessible, un propriétaire valide et un marqueur de transition valide. Simuler aussi l’arrivée d’une session avant l’acquisition du verrou. | Seul le premier cas restaure le mode invité. L’export reste identique et aucun coffre n’est appelé. Les autres cas conservent la valeur stockée et appliquent le contrôle habituel. |

Pour chaque lot, lancer `npm test`, `npx tsc --noEmit`, `npm run lint` et `npm run build`. Vérifier d’abord C0 en tests unitaires et dans Playwright sur deux onglets, puis sur le projet isolé. Fusionner C0 indépendamment de C1. L’ouverture de C1 nécessite les preuves de migration et de livraison OTP en test, puis la validation de l’expéditeur Boussole en production (§5.6).

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
2. **Domaine et expéditeur.** Changer de domaine implique de réactiver la méthode du téléphone. Comme en révision 4, le domaine définitif reste hors du périmètre bloquant de B. Il est requis pour ouvrir C1 avec l’expéditeur Boussole (§5.6).
3. **« Me déconnecter sans effacer ce téléphone »** laisse un budget lisible par la personne suivante si le verrou n’est pas actif. C’est un choix explicite, mais il peut être fait sans lire. Mesure : le bouton n’est pas le choix principal et exige une confirmation.
4. **Héritage.** La base de production était vide avant C0. Tout budget sans clé de propriétaire devient invité, y compris si une ancienne mémoire de synchronisation subsiste (§7.1).
5. **Onglet gelé.** `BroadcastChannel` peut manquer un onglet suspendu. À son réveil, le verrou vérifie ses réglages et C0 relit le contrôle de session et le rattachement avant de rendre le budget.
6. **Effacement par `localStorage.removeItem`** : le navigateur peut garder des traces sur le disque. Dit « supprimé de Boussole », pas plus.
7. **Le trousseau iCloud dans une PWA installée** : non vérifié à ce stade ; si la proposition d’enregistrement n’apparaît pas, le bouton « Copier » et la case de confirmation restent le seul filet. Constat à écrire après la recette §9.3.
8. **Horloge de l’appareil** : l’attente après échecs se fonde dessus ; la reculer raccourcit l’attente. Même catégorie que le point 1.
9. **PR B et téléphone partagé** : quelqu'un connaissant le code du téléphone peut potentiellement vérifier l'utilisateur via WebAuthn. La méthode reste optionnelle et désactivée par défaut ; l'avertissement est affiché **avant** son activation. Une passkey synchronisée ne garantit pas la possession exclusive de cet iPhone. Ce lot ne modifie pas la sécurité cryptographique des données locales.
10. **Conflits iOS / dialogue WebAuthn** : il peut être impossible de distinguer tous les événements du système d'une véritable sortie de l'application ; la machine à états échoue fermée si un événement `hidden/pagehide` invalide une tentative. Si la méthode ne fonctionne pas en pratique sur Chrome iOS, la masquer et conserver le PIN : ne jamais relâcher les contrôles UV ou de visibilité pour améliorer artificiellement le taux de succès.
11. **Ordre des lots.** A, B et C0 sont fusionnés. C1 suit dans une autre PR et inclut les deux cas d’accès local du §5.7. D peut attendre les premiers usages réels de C1.
12. **Effacement abusif.** Une personne qui tient le téléphone peut effacer Boussole depuis l’écran verrouillé après « EFFACER », ou en supprimant l’app du téléphone (§4.5).

## 12. Arbitrages définitifs de la PR B (révision 4)

| Sujet | Décision | Garantie / limite |
|---|---|---|
| Stockage | `boussole-lock-device-v1` séparé, validation indépendante | Une corruption WebAuthn ne force pas l'effacement du budget et ne modifie pas le PIN |
| PIN | Toujours disponible, essais et attentes indépendants | Changer le PIN ne supprime pas WebAuthn ; succès WebAuthn ne remet pas à zéro les échecs PIN |
| Activation | Facultative, confirmée par PIN, clic utilisateur | Le code du téléphone peut remplacer Face ID : risque expliqué à l'avance |
| Cryptographie | ES256, inscription vérifiée, assertions vérifiées, challenge unique, UV=1 | Pas de signature ou d'UV valide = jamais déverrouillé |
| Passkeys | `user.id` frais, `allowCredentials` ciblé, désactivation puis activation pour remplacer une référence valide | Une ancienne passkey peut subsister dans le trousseau |
| iOS | Événements conservés, `blur` distinct de `hidden/pagehide`, tentative invalidée en cas de véritable sortie | Compatibilité physique à tester ; erreur = PIN, jamais assouplir UV |
| Périmètre | PR B limitée au verrou ; aucune nouvelle fonctionnalité compte, cloud ou Foyer | PR C et D restent indépendantes |

La révision 4 a défini les conditions de recette de la PR B (§9.3–9.4). La révision 5.1 prend sa fusion sur `main` comme base C0.
