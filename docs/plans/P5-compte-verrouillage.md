# P5 — Compte facultatif et verrouillage de l’application (révision 5)

Plan de conception revu contre **`main` au commit `cfd94c9`**, qui intègre les lots A et B. La révision 2 a traité C1–C14 et S1–S8. La révision 3 a ajouté N1–N6. La révision 4 a cadré WebAuthn. La révision 5 cible les lots C et D décrits aux §5–7.

### Révision 5 — Association du budget et création de compte (21 novembre 2026)

| Lot | Périmètre | Condition de passage |
|---|---|---|
| **C0** | Rattachement local, calcul de vacuité, contrôle de session, écran global et gel des opérations. Protège aussi l’entrée de synchronisation existante. | Tests d’identité et de concurrence du §9.5 réussis avant d’activer les nouvelles inscriptions. |
| **C1** | Compte facultatif, OTP, phrase secrète, premier budget et création explicite du coffre (§5). | C0 vérifié. Inscription et récupération validées sur un projet Supabase de test isolé. |
| **D** | Preuve de synchronisation avant effacement, détachement volontaire, fin de session et parcours de suppression de compte (§6). | Réutilise le rattachement et le blocage de C0. Les parcours du §6 passent les tests du §9 avant livraison. |

C0 rend les transitions de compte sûres dès sa livraison. C1 est désactivé jusqu’à la validation de C0. Le découpage peut être matérialisé en deux PR ou en deux lots vérifiés dans une même PR.

Quatre constats structurent ce découpage.

1. `unlock` installe la clé, puis appelle `runSync`. Sans coffre distant, `decideSync` peut créer un coffre à partir du budget local. C0 traite le rattachement avant d’appeler le moteur de synchronisation. [CloudSyncProvider](https://github.com/Coliboy-dev/boussole-budget/blob/cfd94c9/components/sync/CloudSyncProvider.tsx#L249) · [decideSync](https://github.com/Coliboy-dev/boussole-budget/blob/cfd94c9/lib/cloud-sync.ts#L32)
2. `signOut` efface la mémoire de synchronisation et conserve le budget. C0 garde le rattachement du budget à son compte même quand la session se ferme. [CloudSyncProvider](https://github.com/Coliboy-dev/boussole-budget/blob/cfd94c9/components/sync/CloudSyncProvider.tsx#L294)
3. `finishOnboarding` enregistre le budget et renvoie actuellement `void`. C1 doit créer le coffre avec l’état sauvegardé retourné par cette opération, avant d’autoriser la synchronisation automatique. [AppContext](https://github.com/Coliboy-dev/boussole-budget/blob/cfd94c9/lib/context/AppContext.tsx#L390)
4. `AppWrapper` compose `AppProvider`, `CloudSyncProvider` et `LockProvider`. C0 ajoute le contrôle d’association sous le verrou existant et protège aussi les points d’écriture des deux fournisseurs. [AppWrapper](https://github.com/Coliboy-dev/boussole-budget/blob/cfd94c9/components/layout/AppWrapper.tsx#L7)

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

**Lot C1**, ouvert seulement après validation de C0 (§7 et §9.5). Jusqu’à cette validation et l’ouverture de C1, l’entrée e-mail existante de C0 permet la connexion aux comptes existants avec `shouldCreateUser: false`. Le parcours **Créer mon compte** demande explicitement la création.

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
2. Le parcours pose les trois questions. `finishOnboarding` retourne l’`AppState` effectivement persisté et l’identifiant de son instantané local. Le premier enregistrement autorisé rattache le budget au compte qui termine le parcours. Aucun envoi automatique ne peut partir pendant cette création.
3. `createInitialVault` chiffre et crée le coffre à partir de cet instantané, après avoir revalidé le compte actif et la réservation d’écriture du §7.4. La mémoire enregistre l’empreinte de ce même contenu. « Copie en ligne créée » s’affiche après confirmation. Boussole propose ensuite le verrou.
4. Si la requête échoue ou sa réponse est perdue, le budget local reste rattaché et la création reste en attente. « La copie en ligne n’a pas pu être confirmée. Ton budget est sur ce téléphone. » propose **Réessayer**. Après rechargement, seul le même compte peut reprendre avec le brouillon local vérifié. Relire le coffre au moment de la reprise. S’il existe, le déchiffrer et comparer son empreinte à l’instantané enregistré. Une égalité confirme la création. Un contenu différent passe par un choix explicite avant toute modification. Un compte différent ne peut ni reprendre la création, ni voir le budget.

### 5.4 Sans compte (C12)
Après les trois questions, l’écran de résultat (`OnboardingResult`) propose aussi « Verrouiller Boussole avec un code ? ».

### 5.5 Personnes existantes
Les parcours sans compte restent disponibles. « Plus → Compte et sécurité » propose « Créer un compte pour ce budget » lorsque la provenance du budget permet ce choix. L’intention ouvre un parcours d’association pour un instantané précis (§7, cas A). La confirmation se fait avec le compte identifié.

### 5.6 E-mail d’authentification et environnement de test

Réutiliser le domaine Resend `mail.startonlab.be`, signalé vérifié et actif dans l’audit, et prévoir `connexion@mail.startonlab.be` comme expéditeur. Le raccordement SMTP personnalisé ou Supabase–Resend et la réception effective restent à vérifier sur le projet de test. Le modèle d’e-mail en français contient `{{ .Token }}` pour transmettre le code numérique. Valider l’expéditeur, la réception, la consommation et l’expiration du code avec des comptes de test. [SMTP Supabase](https://supabase.com/docs/guides/auth/auth-smtp) · [Modèles d’e-mails Supabase](https://supabase.com/docs/guides/auth/auth-email-templates)

Utiliser un projet Supabase isolé avec des comptes et des budgets fictifs. Avant les tests d’intégration, relever la référence du projet et obtenir une preuve que la migration `20261120091727_budget_vaults.sql` y est appliquée. Tester les politiques d’accès avec deux comptes jetables et les identifiants publics de l’environnement de test. Le fichier de migration est présent dans le dépôt. Sa présence ne démontre pas l’état de la base distante. La configuration de production et la livraison des e-mails à de vrais utilisateurs sont validées séparément avant ouverture.

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
C0 traite aussi la session expirée, révoquée ou fermée ailleurs (`SIGNED_OUT`). Le budget et son rattachement sont conservés, masqués et protégés contre toute écriture de session. Si le verrou PIN est actif, le verrou existant reste prioritaire. L’écran de compte indique « Tu n’es plus connecté. Reconnecte-toi à ton compte pour retrouver ton budget. » Seule une reconnexion vérifiée au compte propriétaire permet la reprise. Le cas d’un autre compte suit le §7.

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

Le budget local a un rattachement indépendant de la session, du trousseau et de `boussole-sync-v1` : **invité**, **lié à un `userId`**, ou **provenance inconnue**. Enregistrer le rattachement avec le budget dans le stockage local, dans des métadonnées de l’enveloppe v2. Le fichier exporté et le contenu chiffré synchronisé gardent leur format actuel. Une écriture ordinaire ne change pas le rattachement. Un nouveau budget créé en mode invité est marqué comme tel.

Pour un budget créé avant C0, une mémoire de synchronisation valide désigne le compte à protéger. Si son empreinte correspond au budget local, établir le rattachement à ce compte. En cas d’écart, réserver la reprise à ce même compte, avec confirmation avant toute synchronisation. En l’absence de preuve exploitable, garder la provenance inconnue. Un budget ancien déjà accessible en mode local peut le rester hors session, selon le verrou existant, avec accès à l’export local. Après connexion, Boussole le masque tant que son rattachement ne peut pas être établi. C0 ne peut pas retrouver le propriétaire d’un budget dont les anciennes versions ont effacé toute trace de compte.

### 7.2 Blocage global avant l’OTP et le chargement de la clé

Séparer la décision d’accès au budget de l’état d’avancement réseau. Pendant l’amorçage avec synchronisation configurée, un changement de session ou une association incertaine, `CloudSyncProvider` expose un état bloquant comme `awaiting-association`. Le blocage s’applique dès le début de la vérification d’OTP ou dès réception d’un événement de changement de compte, **avant** le chargement de la clé et tout résultat asynchrone. Distinguer les événements qui répètent le même compte d’un vrai changement de session. Un résultat tardif de `getSession`, du trousseau ou du réseau ne décide jamais à la place de l’identité actuelle.

Composer `AppProvider → CloudSyncProvider → LockProvider → AccountGate → contenu` dans `AppWrapper`. Le verrou PIN ou téléphone reste prioritaire. Dès que ce verrou s’ouvre, `AccountGate` affiche l’écran de connexion, d’association ou de récupération si le budget reste protégé. Il ne monte pas les pages budgétaires, l’en-tête ni la navigation dans cet état. Ce test s’applique aussi au premier rendu, à l’hydratation et à un accès direct à `/dashboard`, `/analyse` ou `/sauvegarde`.

Les lectures en ligne nécessaires sont limitées au compte actif. Distinguer `inconnu`, `absent` et `présent` pour le coffre. Seule une lecture réussie peut conclure à son absence. Une erreur réseau, une phrase erronée ou une clé liée à un autre compte maintient le contrôle en place. En mode invité, l’app reste utilisable hors ligne. Une session propriétaire déjà vérifiée peut continuer à consulter son budget local hors ligne tant qu’aucun changement de session n’a été constaté. La désactivation de la configuration cloud ne transforme pas un budget rattaché en budget invité.

### 7.3 Décisions d’association

Une décision indique le compte, la provenance du budget, l’instantané local et l’état confirmé du coffre. Une intention ouverte avant l’OTP ne suffit pas. La confirmation est recueillie après identification du compte. Si le budget, le compte ou la version du coffre changent entre l’affichage du choix et sa validation, relire l’état et demander une nouvelle décision.

| Cas | Choix autorisé |
|---|---|
| **A.** Créer un compte pour un budget invité identifié, coffre absent | En C1, confirmer explicitement le compte et le budget à associer, puis créer le coffre à partir de l’instantané accepté. |
| **B.** Budget invité non vide, compte existant sans coffre | « Associer ce budget à mon compte », « Commencer avec un budget vide » après confirmation explicite, ou « Annuler ». |
| **C.** Budget invité non vide, compte avec coffre | « Remplacer ce budget par celui de mon compte » après confirmation, ou « Annuler ». Déchiffrer et valider le coffre avant de remplacer le budget local. |
| Budget local vide, sans rattachement à un autre compte | Récupérer le coffre du compte vérifié après validation de la clé si le coffre existe. Sinon, autoriser le premier budget (§5.3 pour C1). |
| Budget rattaché au compte actif | Autoriser la reprise normale après vérification de l’identité et de la clé. Pour une migration avec empreinte divergente, demander une confirmation au propriétaire. |
| Budget rattaché à A, session absente ou compte B | Masquer et conserver le budget. Proposer de revenir au compte A. B ne peut ni associer, ni remplacer, ni effacer le budget de A depuis l’association. Cette règle vaut même si le budget de A est vide. |
| Provenance inconnue, compte connecté | Garder le budget intact et masqué. Proposer d’annuler la connexion. Un coffre déchiffré du compte actif avec une empreinte identique permet de vérifier la provenance. |

« Annuler » conserve le budget, son rattachement et le coffre. Pour un budget invité, l’annulation rend le mode local après confirmation de fermeture de la session en cours. Pour un budget rattaché, l’écran de compte reste en place jusqu’à vérification du propriétaire. Couvrir la matrice par une fonction pure `associationDecision` et des tests sur les décisions invalidées.

### 7.4 Un même contrôle pour l’écran, les écritures et les onglets

- **Synchronisation.** Avant toute opération, vérifier la session, le rattachement, la clé et la génération de transition. Appliquer la même règle à `runSync`, à ses relances, au délai d’envoi après édition, au retour sur l’app ou du réseau, aux commandes manuelles et à `resolveConflict`. Le calcul de `decideSync` intervient après ce contrôle. Le chiffrement AES-GCM et les politiques RLS existantes sont réutilisés.
- **Écritures locales.** Le blocage couvre les mutations et les effets de persistance d’`AppContext`, `saveBudget`, la restauration, la migration et les opérations de paiement. Il couvre aussi l’export ordinaire tant que le budget est masqué. Les choix autorisés reçoivent une permission limitée à l’opération, au compte, à la génération et à l’instantané confirmés. Le parcours d’effacement d’urgence de la PR A garde sa confirmation explicite « EFFACER » et retire le rattachement avec le budget.
- **Concurrence.** Inscrire le blocage dans un état partagé du navigateur avant de commencer une transition, en complément des événements inter-onglets. Chaque onglet relit l’état partagé avant une action et au retour au premier plan, y compris s’il a manqué le message. S’en servir pour masquer l’interface avant d’afficher le budget. Sérialiser les transitions et les écritures locales critiques entre onglets. La comparaison de `writeBudgetSnapshot` protège contre une divergence constatée. La lecture suivie d’une écriture `localStorage` doit être couverte par une exclusion entre onglets pour les transitions.
- **Opérations en cours.** À un changement de compte, invalider la génération, retirer la clé active et annuler les opérations annulables. Contrôler la génération à la reprise de chaque attente et juste avant une écriture, une restauration ou la publication d’un résultat. Une requête déjà partie reste strictement liée au compte validé au départ. Sa réponse tardive ne doit ni modifier le budget ou la mémoire locale, ni lancer une nouvelle requête après le changement de compte. Pour une transition déclenchée par l’app, geler d’abord les nouveaux envois et attendre la fin des opérations déjà parties avant de poursuivre.
- **Reprise et déconnexion.** Pendant C0 et C1, fermer la session ou nettoyer la mémoire de synchronisation conserve le rattachement et le budget. Le détenteur du compte propriétaire doit se reconnecter pour retrouver un budget masqué. Après un rechargement ou une interruption, relire l’état partagé et la session avant de lever le blocage. D ajoute seulement la preuve, l’effacement ou le détachement volontaire et la suppression du compte (§6).

---

## 8. Fichiers touchés

| Lot | Fichiers et responsabilités |
|---|---|
| A et B, livrés | Verrou PIN et WebAuthn sous `components/security/`, `lib/app-lock.ts`, `lib/webauthn-lock.ts`, `lib/device-lock-storage.ts` et tests associés. |
| C0 | `AppWrapper.tsx` et le nouvel `AccountGate`, `AssociationChoice`, `CloudSyncProvider.tsx`, `app/synchronisation/page.tsx`, `AppContext.tsx`, stockage local et décisions d’association, événements inter-onglets dans `lib/security-channel.ts`. Encadrer les appels existants aux coffres et l’effacement d’urgence. |
| C1 | `AccountChoice`, `BudgetOnboarding.tsx`, `lib/passphrase.ts`, `finishOnboarding` dans `AppContext.tsx` et création initiale dans `CloudSyncProvider.tsx`. |
| D | `SignOutFlow`, `lib/account-lifecycle.ts` pour la preuve et l’ordre des opérations, `CloudSyncProvider.tsx`, et propagation des erreurs de trousseau dans `lib/cloud-remote.ts`. |

Les lots C0 et C1 réutilisent le format du coffre, le chiffrement et les politiques RLS présents dans le dépôt. La révision 5 ne prévoit aucun changement de schéma pour ces lots. Documenter les parcours livrés dans `docs/audit/README.md`.

---

## 9. Tests

### 9.1 Unitaires (`npm test`)
1. Code : bon accepté, mauvais refusé, sels différents → hachages différents, aucune trace du code dans l’enregistrement.
2. Essais : 5 échecs → 30 s ; 6ᵉ → 60 s ; plafond 15 min ; succès → remise à zéro ; état conservé après relecture du stockage.
3. `shouldLock` : délai 0, 60 s, 300 s ; retour à 59 s, 60 s, 61 s.
4. `generatePassphrase` avec générateur injecté : format exact ; octets ≥ 248 rejetés (séquence d’entrée connue → sortie connue) ; les 31 symboles atteignables ; entropie théorique 99,1 bits ; la fonction par défaut utilise `crypto.getRandomValues`.
5. WebAuthn : tests indépendants de **l'inscription et de l'assertion**, avec fixtures de CBOR/authenticatorData et signatures ES256 encodées DER (production possible via `node:crypto`), puis DER→P1363 vérifié. Positive : inscription UP/UV/AT correcte, credential ID/rpIdHash/clé/algorithme cohérents ; assertion valide et compteur de signature 0 accepté. Négatifs **indépendants** : `challenge` différent ou rejoué ; `origin` différente ; `crossOrigin:true` ; `type` faux ; RP ID invalide ; UP=0 ou UV=0 ; credential ID inconnu ; clé remplacée ; signature altérée ; erreur d'algorithme ; DER mal formé, tronqué, entier négatif ou surlongueur ; données d'inscription incohérentes ; absence de clé publique. Une réponse de tentative abandonnée/ancienne est toujours rejetée.
6. `associationDecision` et `isPristineBudget` couvrent toute la matrice du §7.3. Vérifier la priorité du rattachement, la provenance inconnue, le coffre d’état inconnu et l’invalidation d’une décision après changement d’identité, de budget ou de version distante.
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

- **Précondition :** la suite de tests déjà présente sur `main` reste verte. Les nouvelles suites vérifient les transitions WebAuthn en plus des 103 tests rapportés lors de la PR A, sans supposer que ce nombre reste constant.
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
| C0 | Suspendre un onglet. Dans un autre, changer de compte pendant une lecture, une dérivation de clé, une restauration ou la réponse d’un envoi. Puis réveiller l’onglet. | Masque en place avant l’affichage. Une réponse de l’ancienne génération ne modifie ni le budget, ni la clé active, ni la mémoire de synchronisation. Les requêtes déjà parties restent liées au compte qui les a autorisées. |
| C0 | Connexion sur budget invité, compte sans coffre puis compte avec coffre. Tester la confirmation, l’annulation, une lecture distante en échec et un changement de budget entre choix et confirmation. | La matrice du §7.3 s’applique. La lecture en échec reste d’état inconnu. Aucun envoi ni remplacement sans décision valide sur le même instantané. |
| C0 | Budget vierge, fichier legacy seul ou encore présent avec la v2, données limitées au profil, à la médiation, aux documents ou à P3. Stockage illisible et ancien budget sans provenance. | Seul le budget complet vierge sans legacy est déclaré vide. Un ancien budget sans provenance garde ses données et ne s’associe pas automatiquement à un nouveau compte. |
| C1 | Création avec OTP reçu, phrase confirmée et premier budget. Rejouer avec une panne avant l’envoi et une réponse perdue après l’insertion. Reprendre après rechargement. | Le budget persiste localement. Le premier coffre correspond exactement à l’instantané sauvegardé. La reprise ne crée ni doublon ni écrasement et le second navigateur récupère ce même budget. |
| C1 | Mode invité pendant la coupure réseau, retour avec et sans compte, confirmation de la phrase générée. | Le parcours invité reste disponible et le parcours compte exige la confirmation de sauvegarde de la phrase. Le compte reçoit seulement le budget qui lui a été associé. |

Pour chaque lot, lancer `npm test`, `npx tsc --noEmit`, `npm run lint` et `npm run build`. Vérifier d’abord C0 en tests unitaires et dans Playwright, puis sur le projet isolé. C1 reste désactivé tant que cette preuve manque. Les essais réels de création de compte nécessitent la preuve de migration et de livraison OTP du §5.6. Une validation sur le projet isolé ne vaut pas validation de la configuration d’envoi en production.

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
4. **Ancienne provenance inconnue.** La mémoire effacée par une ancienne version peut rendre la provenance impossible à établir. La règle du §7.3 conserve ce budget et bloque son association avec un compte jusqu’à preuve de correspondance.
5. **Onglet gelé.** `BroadcastChannel` peut manquer un onglet suspendu. À son réveil, le verrou vérifie ses réglages et C0 relit le contrôle de session et le rattachement avant de rendre le budget.
6. **Effacement par `localStorage.removeItem`** : le navigateur peut garder des traces sur le disque. Dit « supprimé de Boussole », pas plus.
7. **Le trousseau iCloud dans une PWA installée** : non vérifié à ce stade ; si la proposition d’enregistrement n’apparaît pas, le bouton « Copier » et la case de confirmation restent le seul filet. Constat à écrire après la recette §9.3.
8. **Horloge de l’appareil** : l’attente après échecs se fonde dessus ; la reculer raccourcit l’attente. Même catégorie que le point 1.
9. **PR B et téléphone partagé** : quelqu'un connaissant le code du téléphone peut potentiellement vérifier l'utilisateur via WebAuthn. La méthode reste optionnelle et désactivée par défaut ; l'avertissement est affiché **avant** son activation. Une passkey synchronisée ne garantit pas la possession exclusive de cet iPhone. Ce lot ne modifie pas la sécurité cryptographique des données locales.
10. **Conflits iOS / dialogue WebAuthn** : il peut être impossible de distinguer tous les événements du système d'une véritable sortie de l'application ; la machine à états échoue fermée si un événement `hidden/pagehide` invalide une tentative. Si la méthode ne fonctionne pas en pratique sur Chrome iOS, la masquer et conserver le PIN : ne jamais relâcher les contrôles UV ou de visibilité pour améliorer artificiellement le taux de succès.
11. **Ordre des lots.** A et B sont livrés. C0 protège les transitions de compte et conditionne l’ouverture de C1. D réutilise C0 pour la déconnexion prouvée et la suppression de compte.
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

La révision 4 a défini les conditions de recette de la PR B (§9.3–9.4). La révision 5 prend sa fusion sur `main` comme base C0.
