# P5 — Compte facultatif et verrouillage de l’application (révision 4)

Plan de conception, **sans code applicatif**. Historique : la révision 2 a traité C1–C14 et S1–S8, puis la révision 3 a ajouté les corrections N1–N6. **Base de la présente révision : `main` au commit `2862ae0`, intégrant la PR A (verrou PIN et confidentialité visuelle).** Le §4.3 et les tests associés décrivent désormais le lot B ; les §5–7 restent des plans non implémentés pour les lots C et D. Les mentions de futures fonctionnalités ne doivent pas être prises pour des caractéristiques déjà livrées.

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

- **Existant PR A :** `LockProvider` enveloppe **tout** le contenu de `components/layout/AppWrapper.tsx`, sous `AppProvider` et `CloudSyncProvider` (`AppWrapper.tsx:L7–15`). La PR B doit **réutiliser ce composant**, pas créer un second `LockGate`.
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
- Sur l’écran verrouillé, le bouton « Déverrouiller avec le téléphone » apparaît après confirmation de la disponibilité par le navigateur, si la méthode est valablement configurée. Le champ PIN reste visible sans recevoir automatiquement le focus quand le bouton est proposé. Si une méthode configurée est indisponible, affiche « Le déverrouillage par le téléphone n'est pas disponible dans ce navigateur. Utilise ton code Boussole. », place le focus sur le champ PIN et conserve la référence enregistrée. « Code oublié ? » conserve le parcours actuel.

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

**Déverrouillage, par clic explicite uniquement :**

1. Depuis l'écran verrouillé, une **seule tentative en cours** par onglet ; générer un nouveau challenge de 32 octets, mémorisé en mémoire volatile avec un identifiant de tentative. Appeler `navigator.credentials.get` avec `allowCredentials:[{type:'public-key', id:<rawId enregistré>}]`, `rpId` enregistré et autorisé pour cette origine, `userVerification:'required'`. Ne pas lancer automatiquement le dialogue iOS au montage ni au retour de l'arrière-plan.
2. Après retour, vérifier **tous** les éléments : `PublicKeyCredential.type === 'public-key'`, `rawId/credentialId` exactement égal au credential actif, `clientDataJSON.type === 'webauthn.get'`, challenge exact **à usage unique**, `origin === location.origin`, `crossOrigin !== true`, `rpIdHash === SHA-256(rpId)`, drapeaux UP et UV tous deux présents, `algorithm === -7` et signature ES256 valide de `authenticatorData || SHA-256(clientDataJSON)` avec la **clé publique locale enregistrée**. Consommer le challenge à la réussite, à l'échec, au rejet ou à l'annulation ; refuser toute réponse de tentative précédente.
3. Pour ES256, WebAuthn fournit une signature ECDSA encodée en **ASN.1 DER** ; la conversion robuste et vérifiée vers le format brut P1363 `r||s` (64 octets), attendu par Web Crypto, est obligatoire. Rejeter les DER mal formés, les longueurs incorrectes, les entiers invalides, les surlongueurs et les signatures altérées. Importer la clé SPKI et vérifier avec `crypto.subtle.verify`.
4. Le compteur de signatures n'est **pas un critère de refus** dans cette version : les passkeys synchronisées peuvent utiliser 0 ou un compteur non strictement monotone. Documenter cette limite ; ce compteur ne prouve ni l'unicité ni la possession physique du téléphone. Les indicateurs de sauvegarde/synchronisation de credential ne permettent pas non plus de garantir qu'elle n'existe que sur un appareil.
5. Annulation, erreur API, méthode supprimée, absence de UV, signature invalide, méthode devenue incompatible : **ne jamais déverrouiller**, ne jamais effacer le budget, ne jamais modifier les échecs ni le compteur `retryAt` du PIN ; proposer le PIN immédiatement et, si utile, la réactivation de la méthode dans les réglages. Une authentification WebAuthn réussie **ne réinitialise pas** le compteur PIN.

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
- **Prévu seulement dans la PR D :** ajouter `signing-out`, `signed-out`, `account-changed` ; `signing-out` bloquera l'interface et les envois, les deux autres provoqueront un rechargement sécurisé. Ne pas anticiper ces fonctions dans la PR B.

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
1. E-mail → code → connexion. 2. Phrase secrète. 3. Les trois questions du premier budget. 4. **Création explicite du coffre** : comme `decideSync` renvoie `idle` pour un budget vide, et comme `runSync` lit l’état via `appRef` (mis à jour **après** le rendu, `CloudSyncProvider` L62–66), `finishOnboarding` est modifiée pour **retourner l’`AppState` enregistré** ; l’écran appelle alors `createInitialVault(savedState)`, qui chiffre ce budget-là, crée le coffre et écrit la mémoire de synchronisation avec son empreinte. Aucun délai artificiel. L’écran indique « Copie en ligne créée » ou, en cas d’échec, « La copie en ligne n’a pas pu être créée. Ton budget est sur ce téléphone. » avec « Réessayer ». 5. Proposition du verrou.

### 5.4 Sans compte (C12)
Après les trois questions, l’écran de résultat (`OnboardingResult`) propose aussi « Verrouiller Boussole avec un code ? ».

### 5.5 Personnes existantes
Aucun changement imposé. « Plus → Compte et sécurité » propose « Créer un compte pour ce budget » : intention explicite d’associer (§7, cas A).

---

## 6. Déconnexion prouvée (C2, C3, C7, C8, C9, D5)

### 6.1 Déroulé de « Se déconnecter »
1. **Gel** : écran bloquant « Déconnexion en cours » ; envoi `signing-out` aux autres onglets ; annulation du minuteur d’envoi automatique (1,5 s) ; attente de la fin de toute synchronisation en cours (`busy` dans `CloudSyncProvider`).
   - Pose de la clé `boussole-session-closing` (horodatée) dans `localStorage`. Tant qu’elle existe, **tout onglet** refuse les écritures du budget et les synchronisations (contrôle ajouté à l’entrée de `saveBudget`, de l’effet d’enregistrement d’`AppContext` et de `runSync`), y compris un onglet qui se réveille sans avoir reçu le message.
   - Après l’effacement, un onglet resté ouvert ne peut pas réécrire l’ancien budget : `writeBudgetSnapshot` (`lib/budget-state.ts` L23–42) refuse déjà toute écriture quand le contenu stocké a changé depuis sa lecture (ici : supprimé).
   - La clé `boussole-session-closing` est supprimée en dernier, une fois la session fermée ; si elle a plus de 10 minutes au lancement (déconnexion interrompue), Boussole reprend le parcours §6.1 au point 3.
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
`eraseLocalData()` (`lib/account-lifecycle.ts`), **livrée dans la PR A** et réutilisée par la déconnexion :
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

### 7.1 Budget vide
`localIsEmpty` actuel (`CloudSyncProvider` L68–70) ignore la médiation, les documents et le profil. Il est remplacé par `isPristineBudget(state)` : vrai **seulement si** `serializeBudget(state) === serializeBudget(emptyBudgetState)` et qu’aucune sauvegarde legacy (`boussole-budget-v1`) n’existe. Toute différence (prénom, réserve, document, étape de médiation, enveloppe…) = budget non vide. Utilisé par `decideSync`, par l’association et par la création du premier coffre.

### 7.2 Entrée et affichage
Entrée dans cet état : après connexion **et** saisie de la phrase secrète, si `isPristineBudget` est faux **et** si la mémoire de synchronisation n’appartient pas à ce `userId`, **sauf** intention explicite d’associer (cas A).

Pendant `awaiting-association`, un `AccountGate` (même place que `LockGate`) remplace **toutes les pages** par l’écran d’association : une navigation directe vers `/dashboard`, `/analyse` ou toute autre page n’affiche aucun montant.

Lectures permises : `fetchVault` (existence du coffre, sel). **Aucune écriture** (création, mise à jour, suppression de coffre) avant la décision.

| Cas | Copie en ligne du compte | Choix proposés |
|---|---|---|
| A. « Créer un compte pour ce budget » depuis les réglages | absente | Association directe (création du coffre), sans écran intermédiaire |
| B. Budget local présent, compte **sans** copie en ligne | absente | « Associer ce budget à mon compte » · « Commencer avec un budget vide » (efface le local après confirmation) · « Annuler » (déconnexion, local conservé) |
| C. Budget local présent, compte **avec** copie en ligne | présente | « Remplacer ce budget par celui de mon compte » (récupération après confirmation) · « Annuler » |

Aucun contenu du budget local n’est affiché sur ces écrans. Fonction pure `associationDecision({ localIsEmpty, memoryUserId, userId, remoteExists, intent })` testée.

---

## 8. Fichiers touchés

**PR B uniquement :** créer `lib/webauthn-lock.ts` (enregistrement, validation registration/assertion, DER→P1363), `lib/device-lock-storage.ts` (credential local indépendant), adapter `components/security/LockProvider.tsx`, `LockScreen.tsx`, `LockSettings.tsx`, `lib/account-lifecycle.ts` (effacement de la nouvelle clé), et ajouter `tests/webauthn-lock.test.mjs`. Aucun ajout Supabase, aucune nouvelle route, aucun changement du chiffrement des budgets. Réutiliser `lib/security-channel.ts` et ses événements existants ; ne créer un événement nouveau que si un test démontre la nécessité. L'intégration doit conserver la PR A en l'état hors adaptations strictement nécessaires. Les modifications du §8 ci-dessous restent le **périmètre global P5**, non une liste à recoder pendant PR B.

Nouveaux : `lib/app-lock.ts` (hachage, comparaison, essais, `shouldLock`), `lib/webauthn-lock.ts` (création, contrôle, vérification de signature), `lib/passphrase.ts`, `lib/account-lifecycle.ts` (`associationDecision`, `signOutSteps`, `proveSynced` sans réseau injecté), `lib/security-channel.ts`, `components/security/LockProvider.tsx` (déjà livré en A), `LockScreen.tsx` et `LockSettings.tsx` (déjà livrés en A), `components/onboarding/AccountChoice.tsx`, `components/sync/AssociationChoice.tsx`, `components/sync/SignOutFlow.tsx`.

Modifiés : `components/layout/AppWrapper.tsx`, `TopHeader.tsx`, `components/sync/CloudSyncProvider.tsx` (état `awaiting-association`, gel, comparaison avant conflit, suppression du compte séparée), `lib/cloud-remote.ts` (`clearStoredKey` qui propage les erreurs), `components/onboarding/BudgetOnboarding.tsx`, `app/synchronisation/page.tsx` (« Compte et sécurité », même URL), `app/plus/page.tsx` (libellé de l’entrée), `app/sauvegarde/page.tsx` (avertissement fichier en clair), `app/confidentialite/page.tsx` (§2), `app/globals.css` (`privacy-veil`), `docs/audit/README.md`.

---

## 9. Tests

### 9.1 Unitaires (`npm test`)
1. Code : bon accepté, mauvais refusé, sels différents → hachages différents, aucune trace du code dans l’enregistrement.
2. Essais : 5 échecs → 30 s ; 6ᵉ → 60 s ; plafond 15 min ; succès → remise à zéro ; état conservé après relecture du stockage.
3. `shouldLock` : délai 0, 60 s, 300 s ; retour à 59 s, 60 s, 61 s.
4. `generatePassphrase` avec générateur injecté : format exact ; octets ≥ 248 rejetés (séquence d’entrée connue → sortie connue) ; les 31 symboles atteignables ; entropie théorique 99,1 bits ; la fonction par défaut utilise `crypto.getRandomValues`.
5. WebAuthn : tests indépendants de **l'inscription et de l'assertion**, avec fixtures de CBOR/authenticatorData et signatures ES256 encodées DER (production possible via `node:crypto`), puis DER→P1363 vérifié. Positive : inscription UP/UV/AT correcte, credential ID/rpIdHash/clé/algorithme cohérents ; assertion valide et compteur de signature 0 accepté. Négatifs **indépendants** : `challenge` différent ou rejoué ; `origin` différente ; `crossOrigin:true` ; `type` faux ; RP ID invalide ; UP=0 ou UV=0 ; credential ID inconnu ; clé remplacée ; signature altérée ; erreur d'algorithme ; DER mal formé, tronqué, entier négatif ou surlongueur ; données d'inscription incohérentes ; absence de clé publique. Une réponse de tentative abandonnée/ancienne est toujours rejetée.
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
16. Création de compte avant le premier budget : coffre créé à la fin de l’étape 3 **sans attente entre la fin du questionnaire et la création**, contenant exactement le budget enregistré, et récupéré sur un second navigateur.
17. Association : budget sans compte + compte vide (cas B) ; budget sans compte + compte avec copie (cas C) ; **zéro écriture** vers `budget_vaults` avant le choix (requêtes `POST`, `PATCH`, `DELETE` interceptées et comptées : 0 ; les lectures sont permises).
17 bis. Budget contenant **uniquement** une étape de médiation, ou uniquement un document, ou uniquement un prénom : jamais considéré comme vide, jamais remplacé sans choix.
17 ter. Pendant l’association, navigation directe vers `/dashboard` et `/analyse` : aucun montant local dans le DOM.
18. Code oublié avec compte : impossible d’afficher le budget local sans effacement préalable ; après effacement, récupération exigeant code e-mail **et** phrase secrète.
19. Suppression du compte : parcours complet, sans blocage, choix local respecté.
20. WebAuthn avec authentificateur virtuel Chromium (CDP `WebAuthn.addVirtualAuthenticator`, `hasUserVerification:true` puis `false`) couvre l’activation par clic avec le PIN existant, le déverrouillage, le refus sans UV, le secours PIN après suppression du credential (`removeCredential`), l’annulation et la tentative double. Le changement de PIN conserve l’option, sa désactivation retire la référence et l’effacement supprime les deux clés. Le PIN reste lisible si `boussole-lock-device-v1` est corrompu et son délai d’attente survit à un succès WebAuthn. Si le navigateur annonce la méthode indisponible alors qu’elle est configurée, le bouton est masqué, le champ PIN reçoit le focus et la référence est conservée.
21. Verrou proposé après un premier budget sans compte.
22. Retour après 59 s, 60 s, 61 s avec un délai d’une minute ; redémarrage du navigateur → verrouillé.
22 bis. Retour au premier plan après le délai : captures du DOM et de la page à chaque image entre le retour `visible` et l’affichage de l’écran verrouillé ; aucune ne montre de montant.
22 ter. Deux onglets dont un suspendu (émulation de gel du processus) ; verrouillage dans l’autre ; réveil de l’onglet suspendu : aucun budget visible.
22 quater. Code oublié sans compte : aucune suppression sans la saisie « EFFACER » ; après suppression, toutes les clés locales absentes et l’écran de choix affiché.
22 quinquies. Synchronisation en cours dans un onglet, déconnexion dans l’autre : aucune dépense perdue, aucun ancien budget réécrit après l’effacement.
23. `privacy-veil` présente pendant `hidden` (test technique seulement, voir 9.3).
24. axe-core : 0 violation sur l’écran de choix, la phrase secrète, le verrouillage, les réglages, l’association, la déconnexion bloquée.
Les tests 11 à 19 utilisent un **projet Supabase de test isolé** (projet gratuit distinct, mêmes migrations), jamais le projet de production. Prérequis des PR C et D, pas de la PR A.

### 9.3 Recette manuelle sur appareils (avant fusion, captures à l’appui)
Sur iPhone, tester **Safari, Chrome iOS et la PWA installée**. Sur Android, tester Chrome et la PWA si un appareil est disponible. Avec le délai « Immédiatement », vérifier que Face ID déverrouille du premier coup, qu’un échec suivi du **code du téléphone** ouvre le budget et qu’une annulation revient au verrou avec le PIN Boussole utilisable. Lors d’une sortie réelle pendant le dialogue, le budget reste masqué et le retour permet la saisie du PIN sans voile bloqué. Vérifier la disponibilité dans Chrome iOS dès la première préversion. Une méthode indisponible laisse le PIN utilisable. Après suppression de la passkey dans le trousseau, vérifier le secours PIN puis la désactivation et la réactivation dans les réglages. Vérifier aussi le changement de PIN, la réinstallation de la PWA et l’accès depuis un second appareil. Consigner les résultats et limites des essais physiques dans la page Confidentialité.

### 9.4 Preuves minimales spécifiques à la PR B

- **Précondition :** la suite de tests déjà présente sur `main` reste verte. Les nouvelles suites vérifient les transitions WebAuthn en plus des 103 tests rapportés lors de la PR A, sans supposer que ce nombre reste constant.
- **Stockage.** `boussole-lock-v1` de la PR A fonctionne sans migration. Une référence WebAuthn absente, altérée ou incompatible préserve le PIN et le solde. Une nouvelle référence est écrite après validation. Pour remplacer une référence valide, la désactivation précède la réactivation et le PIN reste utilisable si celle-ci est annulée. Désactiver le verrou PIN ou effacer Boussole retire la référence WebAuthn et vérifie son absence.
- **Concurrence.** Une seule tentative peut être en cours par onglet. Le message `locked` d’un autre onglet invalide la tentative. Une assertion valide peut être acceptée après un simple `blur` si la page est toujours visible. Un `visibilitychange:hidden` ou `pagehide` invalide la tentative même si la signature renvoyée est valide. Au retour, le budget reste masqué et le voile laisse le PIN accessible.
- **Secours :** si la méthode téléphone devient indisponible, le PIN déverrouille ; une annulation WebAuthn ne consomme aucun essai PIN ; un succès WebAuthn ne remet pas le compteur PIN à zéro ; perte/oubli de PIN n'est jamais « réparé » automatiquement par WebAuthn.
- **Distinction des preuves :** Node démontre la logique cryptographique ; Chromium virtuel démontre la logique de navigateur simulé ; **seul un essai physique** valide les fenêtres système, leur effet sur la visibilité, le comportement Chrome iOS, et la PWA.
- **Gate de fusion PR B :** pas de fusion si une méthode autorisée ouvre l'application sans UV/signature valide, si le PIN devient inutilisable, si le budget apparaît au mauvais moment, ou si les tests iPhone requis restent non réalisés. Une indisponibilité WebAuthn propre à un navigateur peut être acceptée si l'option y est masquée, le PIN fonctionne et la limitation est communiquée.

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
9. **PR B et téléphone partagé** : quelqu'un connaissant le code du téléphone peut potentiellement vérifier l'utilisateur via WebAuthn. La méthode reste optionnelle et désactivée par défaut ; l'avertissement est affiché **avant** son activation. Une passkey synchronisée ne garantit pas la possession exclusive de cet iPhone. Ce lot ne modifie pas la sécurité cryptographique des données locales.
10. **Conflits iOS / dialogue WebAuthn** : il peut être impossible de distinguer tous les événements du système d'une véritable sortie de l'application ; la machine à états échoue fermée si un événement `hidden/pagehide` invalide une tentative. Si la méthode ne fonctionne pas en pratique sur Chrome iOS, la masquer et conserver le PIN : ne jamais relâcher les contrôles UV ou de visibilité pour améliorer artificiellement le taux de succès.
11. **Volume du chantier** : nettement plus gros que la révision 1. Découpage : **PR A** verrou, code, onglets, voile (§4.4 révisé), `eraseLocalData()` et code oublié sans compte, tests 1 à 3, 9, 10 (partie verrou), 22 à 22 quater, 23, 24 ; **PR B** WebAuthn ES256 vérifié, credential indépendant, transitions d'authentification et tests §9.4 ; **PR C** écran de choix, phrase, `isPristineBudget`, création du premier coffre ; **PR D** déconnexion prouvée, association et `AccountGate`, suppression du compte, déconnexion non demandée.
10. **Effacement abusif** : une personne qui tient le téléphone peut effacer Boussole (depuis l’écran verrouillé après « EFFACER », ou en supprimant l’app du téléphone). Non évitable ; écrit dans l’app (§4.5).

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

**Décision à l'issue de la révision 4 : PR B prête à être développée au niveau documentaire**, avec une condition impérative de recette et de fusion sur appareils réels (§9.3–9.4). Cette décision ne vaut ni validation du code à venir, ni validation de la compatibilité Chrome iOS avant essai.
