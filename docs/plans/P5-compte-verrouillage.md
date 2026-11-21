# P5 — Compte facultatif et verrouillage de l’application

Plan de conception soumis à un audit contradictoire **avant** tout code. Confronté au code de `main` au commit `deb1cf4`. Ce chantier précède le Foyer (P4), qui a besoin de comptes et d’un stockage local séparé par compte.

---

## 1. Objectif

1. **Verrouiller Boussole** : un code et, si le téléphone le permet, Face ID ou l’empreinte, pour qu’une personne qui tient le téléphone déverrouillé ne voie pas les finances. Disponible **avec ou sans compte**.
2. **Proposer un compte dès le premier lancement**, sans l’imposer : « Créer mon compte » (recommandé), « J’ai déjà un compte », « Continuer sans compte ».
3. **Rendre la phrase secrète indolore** sans renoncer au chiffrement de bout en bout.
4. **Corriger un défaut relevé par l’audit P4** : le budget local est stocké sous une seule clé (`boussole-budget-v2`) et la déconnexion ne l’efface pas (`CloudSyncProvider.signOut` efface la clé de chiffrement et la mémoire de synchronisation, pas le budget). Deux personnes qui se succèdent sur un appareil peuvent voir le budget de la précédente.

Hors périmètre : Foyer, chiffrement du stockage local, connexion par passkey au serveur, notifications.

---

## 2. Modèle de menace (à écrire tel quel dans l’app et la page Confidentialité)

| Situation | Protégé ? |
|---|---|
| Un proche, un enfant ou un collègue prend le téléphone **déverrouillé** et ouvre Boussole | **Oui** : verrou de l’app |
| Aperçu de Boussole dans le sélecteur d’applications | **Oui** : écran masqué |
| Une autre personne se connecte à son compte sur le même navigateur après moi | **Oui** : budget effacé à la déconnexion (§5) |
| Le serveur Supabase ou Start’OnLab lit le budget synchronisé | **Non possible** : chiffrement de bout en bout (inchangé) |
| Quelqu’un extrait techniquement les données du téléphone (outils de développement, téléphone volé et déverrouillé par expertise) | **Non** : le verrou est une barrière d’affichage. La protection relève du code du téléphone et de son chiffrement. |

Texte affiché lors de l’activation du verrou : « Le verrou empêche une personne qui a ton téléphone en main de voir tes finances. Il ne remplace pas le code de ton téléphone. »

---

## 3. Verrouillage

### 3.1 Réglages (« Plus → Compte et sécurité »)
- **Verrouiller Boussole** : interrupteur. À l’activation, choix d’un **code à 6 chiffres**, saisi deux fois.
- **Déverrouiller avec Face ID / l’empreinte** : proposé seulement si `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()` répond vrai.
- **Délai** : « Immédiatement », « Après 1 minute » (défaut), « Après 5 minutes » hors de l’application.
- **Verrouiller maintenant** : bouton dans l’en-tête quand le verrou est actif.

### 3.2 Stockage et vérification du code
- Jamais stocké en clair. Enregistrement local `boussole-lock-v1` : `{ salt, hash, iterations: 200000, attempts, lockedUntil, credentialId?, delay }`, hachage PBKDF2-SHA-256 via `crypto.subtle`.
- Comparaison en temps constant sur les octets du hachage.
- Essais : après **5** échecs, attente de 30 s ; puis doublement à chaque nouvel échec (60 s, 120 s…, plafond 15 min). Le compteur est enregistré, donc recharger la page ne le remet pas à zéro.

### 3.3 Biométrie (WebAuthn local)
- Activation : `navigator.credentials.create` avec `authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }`, `rp.id` = domaine de l’app, identifiant utilisateur aléatoire. On garde `credentialId`.
- Déverrouillage : `navigator.credentials.get` avec `allowCredentials: [credentialId]`, `userVerification: 'required'`. Une assertion renvoyée = déverrouillé.
- Aucune vérification de signature côté serveur : le verrou est une barrière locale (§2). Les échecs ou l’absence de biométrie retombent sur le code.
- À vérifier pendant le développement : comportement dans la PWA installée sur iPhone (Face ID) et sur Android (empreinte).

### 3.4 Déclenchement
- **Au lancement** si le verrou est actif.
- **Au retour** : `visibilitychange` → `hidden` enregistre l’heure ; au retour `visible`, verrouillage si le délai est dépassé. Fonction pure `shouldLock({ hiddenAt, now, delay })`, testée.
- **Pendant le verrouillage, les écrans du budget ne sont pas rendus** (pas seulement masqués) : `LockGate` affiche l’écran de déverrouillage à la place des enfants de `AppWrapper`. Le contexte budgétaire reste chargé en mémoire.
- **Écran masqué dans le sélecteur d’applications** : dans le gestionnaire `visibilitychange` → `hidden`, ajout **synchrone** d’une classe `privacy-veil` sur `document.documentElement` (fond uni, contenu caché par CSS), retirée au retour visible. Fait en dehors de React pour être appliqué avant la capture de l’aperçu.

### 3.5 Code oublié
- Biométrie active : la proposer.
- **Avec compte** : « Code oublié ? » → reconnexion par code e-mail (preuve d’identité) → choix d’un nouveau code. Le budget n’est pas touché.
- **Sans compte et sans biométrie** : seule issue, « Effacer Boussole sur ce téléphone ». Avertissement à l’activation du verrou : « Sans compte, un code oublié oblige à effacer ton budget. Active la biométrie ou un compte pour éviter ça. »

---

## 4. Premier lancement

### 4.1 Écran de choix (avant les trois questions actuelles de `BudgetOnboarding`)
- **Créer mon compte** — bouton principal. Texte : « Sauvegarde automatique, plusieurs appareils, et le partage en couple plus tard. Ton budget est chiffré sur ton téléphone : personne d’autre ne peut le lire. »
- **J’ai déjà un compte** — se connecter et récupérer le budget chiffré.
- **Continuer sans compte** — lien secondaire. Texte : « Tout reste sur ce téléphone. Tu pourras créer un compte plus tard. »
- La démo et la restauration d’une sauvegarde restent accessibles, comme aujourd’hui.
- Si la synchronisation n’est pas configurée sur la version (`cloudConfigured` faux), l’écran de choix n’apparaît pas.

### 4.2 Création de compte
Réutilise `CloudSyncProvider` (`sendCode`, `verifyCode`, `unlock`) :
1. E-mail → code reçu → connexion.
2. Phrase secrète (§4.3).
3. Les trois questions actuelles du premier budget.
4. Proposition finale : « Verrouiller Boussole avec un code ? » (facultatif).
La première synchronisation crée le coffre (`decideSync` → `create`), comme aujourd’hui.

### 4.3 Phrase secrète simplifiée
- Par défaut, Boussole **génère** la phrase : 4 groupes de 5 caractères dans un alphabet sans caractères ambigus (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`, 31 symboles), soit environ 99 bits. Ex. `K7PQM-R2XHV-9TDNA-WC4ZE`. Bouton « Choisir ma propre phrase » (règle actuelle : 12 caractères minimum).
- **Gestionnaire de mots de passe** : la phrase est présentée dans un vrai formulaire avec un champ e-mail `autocomplete="username"` (prérempli, lecture seule) et un champ `autocomplete="new-password"`, soumis normalement, pour que le trousseau iCloud ou Google propose de l’enregistrer. Sur un nouvel appareil, le champ de déverrouillage utilise `autocomplete="current-password"`.
- Boutons « Copier » et « Télécharger ma phrase » (fichier texte). Confirmation obligatoire : case « J’ai enregistré ma phrase secrète » avant de continuer.
- Texte honnête : « Si tu perds tous tes appareils **et** cette phrase, personne ne pourra récupérer ton budget en ligne, pas même nous. »
- À vérifier pendant le développement : la proposition d’enregistrement du trousseau dans la PWA installée sur iPhone.

### 4.4 Utilisateurs existants
Aucun changement imposé. Les budgets déjà sur un appareil restent en mode « sans compte ». « Plus → Compte et sécurité » propose de créer un compte ; le budget local devient alors celui du compte (première synchronisation `create`, comportement actuel).

---

## 5. Déconnexion et stockage local

**Décision : un compte connecté = un seul budget local, effacé à la déconnexion.** Pas de budgets multiples côte à côte sur un même navigateur.

- « Se déconnecter » vérifie d’abord que la copie en ligne est à jour (`runSync` puis phase `synced`). Si elle ne l’est pas (hors ligne, erreur, conflit) : message « Ton budget n’est pas encore synchronisé. Reconnecte-toi au réseau ou télécharge une sauvegarde avant de te déconnecter. » avec les boutons « Réessayer » et « Télécharger une sauvegarde ». Déconnexion bloquée tant que l’un des deux n’est pas fait.
- Une fois à jour : efface le budget local (`clearBudget`), la clé de chiffrement (`clearStoredKey`), la mémoire de synchronisation (`clearSyncMemory`), le verrou (`boussole-lock-v1`) et la date de dernière sauvegarde, puis ramène à l’écran de choix.
- **Se connecter avec un autre compte** sur un appareil qui contient un budget « sans compte » non vide : l’écran demande « Ce téléphone contient déjà un budget. L’associer à ce compte, ou le remplacer par celui du compte ? ». « L’associer » n’est proposé que si le compte n’a pas encore de coffre ; sinon le choix est « Remplacer » (après proposition de télécharger une sauvegarde) ou « Annuler ».
- Fonction pure `signOutDecision({ phase, localDirty })` → `{ action: 'erase' } | { action: 'blocked', reason }`, testée.

---

## 6. Écrans touchés

- `components/onboarding/AccountChoice.tsx` (nouveau) et `BudgetOnboarding.tsx` : écran de choix avant l’étape 1.
- `app/synchronisation/page.tsx` devient « Compte et sécurité » (titre et entrée dans Plus), avec les sections Compte, Verrouillage, Phrase secrète ; l’URL reste `/synchronisation` pour ne pas casser le cache hors ligne.
- `components/security/LockGate.tsx`, `LockScreen.tsx`, `lib/app-lock.ts` (fonctions pures : hachage, comparaison, essais, délai, `shouldLock`), `lib/passphrase.ts` (génération).
- `components/layout/AppWrapper.tsx` : `LockGate` autour du contenu ; `TopHeader.tsx` : bouton « Verrouiller ».
- `app/globals.css` : classe `privacy-veil`.
- `app/confidentialite/page.tsx` : modèle de menace §2.

---

## 7. Tests

**Unitaires (`npm test`)**
1. `hashPin` / `verifyPin` : bon code accepté, mauvais refusé, sel différent → hachages différents, aucune trace du code en clair dans l’enregistrement.
2. Essais : 5 échecs → attente 30 s ; 6ᵉ → 60 s ; plafond 15 min ; un succès remet à zéro ; l’état survit à une relecture du stockage.
3. `shouldLock` : délai 0 / 60 s / 300 s, retour avant et après le délai, verrou inactif.
4. `generatePassphrase` : format `XXXXX-XXXXX-XXXXX-XXXXX`, alphabet exact, 1 000 tirages tous différents, entropie calculée ≥ 98 bits.
5. `signOutDecision` : synchronisé → effacer ; hors ligne, erreur, conflit ou modifications non envoyées → bloqué avec le bon motif.

**Navigateur (Playwright, 390 × 844, build de production)**
6. Premier lancement : les trois choix ; « Continuer sans compte » mène aux trois questions actuelles.
7. Verrou : activation avec code, fermeture/réouverture → écran de verrouillage, aucun montant dans le DOM tant que verrouillé ; mauvais code ×5 → attente affichée.
8. Biométrie avec l’authentificateur virtuel de Chromium (CDP `WebAuthn.addVirtualAuthenticator`) : activation et déverrouillage.
9. Retour après le délai (horloge simulée + émulation `visibilitychange`) → verrouillé ; avant le délai → non.
10. Classe `privacy-veil` présente pendant `hidden`, absente ensuite.
11. Déconnexion : synchronisé → budget effacé et écran de choix ; hors ligne simulé → déconnexion bloquée.
12. Création de compte et récupération sur un second navigateur contre le vrai projet Supabase, avec un compte jetable supprimé ensuite (même méthode que la vérification de P2-3).
13. axe-core : 0 violation sur l’écran de choix, la phrase secrète, le verrouillage et les réglages.

---

## 8. Prérequis

- **Envoi des e-mails** : Supabase n’envoie que quelques e-mails de connexion par heure sans serveur SMTP. Pour le développement et les tests, suffisant. **Avant d’ouvrir l’inscription au public : Resend configuré comme SMTP de Supabase**, avec les modèles d’e-mail en français contenant `{{ .Token }}`.

---

## 9. Décisions à challenger

Chaque décision ci-dessous a une alternative crédible. L’audit doit dire laquelle il retiendrait et pourquoi.

| # | Décision proposée | Alternative écartée | Raison du choix |
|---|---|---|---|
| D1 | Compte **facultatif**, proposé en premier | Compte obligatoire | La cible se méfie des serveurs ; le mode local reste un argument |
| D2 | Phrase secrète **générée** et confiée au trousseau | Pas de phrase : chiffrement par le serveur, récupération par e-mail | Garder « personne ne peut lire ton budget », sur lequel repose aussi le Foyer |
| D3 | Code à **6 chiffres** | 4 chiffres, ou code alphanumérique | Compromis saisie rapide / essais limités |
| D4 | Verrou = **barrière d’affichage**, sans chiffrer le stockage local | Chiffrer le budget local avec une clé dérivée du code ou de la biométrie (extension WebAuthn PRF) | Un code à 6 chiffres se casse hors ligne en secondes si quelqu’un extrait les données ; PRF n’est pas disponible partout. Gain réel faible pour un coût élevé |
| D5 | **Effacer** le budget à la déconnexion | Garder plusieurs budgets locaux, un par compte, sur le même navigateur | Plus simple, et un téléphone est personnel ; la copie en ligne est vérifiée à jour avant |
| D6 | Délai par défaut **1 minute** | Immédiat | Éviter de retaper le code en revenant d’un SMS |
| D7 | Verrou **proposé** à la fin de l’inscription, pas activé d’office | Activé d’office | Ne pas ajouter de friction au premier usage |
