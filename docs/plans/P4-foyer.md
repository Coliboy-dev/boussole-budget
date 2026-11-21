# P4 — Foyer : un budget commun à deux, des finances personnelles privées

Plan de conception, **pas encore de développement**. Il intègre les corrections A à E et la charte éditoriale issues de la relecture du 21 novembre 2026. Il a été confronté au code de `main` au commit `cefe1ff` : chaque fonction citée existe, et chaque attendu chiffré de la section 9 marqué « vérifié » a été recalculé avec le moteur actuel.

Signature du mode : **« Votre budget commun, en toute transparence. Les finances personnelles de chacun restent privées. »**

---

## 0. Consignes pour l’agent de code

Toutes les consignes de `docs/plans/P3-depenses-enveloppes.md` §0 s’appliquent (une PR à la fois, tests d’abord, aucun attendu existant modifié, centimes, dates Europe/Brussels, aucune dépendance npm nouvelle, français et tutoiement, accessibilité, quatre commandes avant chaque PR). En plus :

1. **Le serveur ne doit jamais recevoir un montant, un libellé, une date de budget ni un prénom en clair.** Toute donnée du foyer est chiffrée sur l’appareil.
2. **Aucune donnée de l’espace Personnel ne quitte l’appareil vers le foyer.** Seules les données créées *dans* le foyer y sont envoyées.
3. **Aucun texte du foyer n’est écrit en dur dans un composant** : tous viennent de `lib/household-copy.ts` (§2.4), testé.
4. Chaque PR se termine par sa **condition de validation** (§8). Si elle n’est pas démontrée par un test, la PR n’est pas prête.
5. En cas de contradiction entre ce plan et le code, **s’arrêter et le signaler**.

---

## 1. Objectif et périmètre

Deux personnes partagent un **compte commun** qu’elles alimentent depuis leurs **comptes personnels**. Chacune garde la main sur son propre compte. Boussole doit montrer clairement l’état de l’argent commun, sans rien révéler de l’argent personnel et sans jamais juger.

Inclus en V1 :
- deux espaces : **Personnel** (l’actuel, inchangé) et **Foyer** (nouveau, partagé) ;
- un foyer = **2 membres au maximum**, chacun avec son propre compte ;
- invitation par lien, synchronisation élément par élément, hors ligne possible ;
- versements des comptes personnels vers le compte commun, attendus puis confirmés ;
- dépenses communes avancées avec l’argent personnel ;
- transferts entre partenaires, déclarés puis confirmés par la personne qui reçoit ;
- option « Nous n’avons pas de compte commun » (couples aux comptes séparés : dépenses communes et avances uniquement) ;
- départ, arrêt du partage, renouvellement de la clé, copie en lecture seule pour la personne qui n’a plus accès.

Hors périmètre V1 : plus de 2 membres, paiement de l’offre (Stripe), notifications push, import bancaire, calcul d’une répartition « juste » (50/50 ou au prorata), conseils automatiques dans le foyer.

---

## 2. Charte éditoriale du Foyer

### 2.1 Règle fondamentale
**Boussole informe sur l’argent, jamais sur la valeur, les efforts ou les responsabilités des personnes.** Ni juge, ni arbitre, ni outil de surveillance.

Les cinq obligations :
1. **Vocabulaire descriptif** : des faits datés et chiffrés.
2. **Aucune attribution de faute** : on parle du foyer et de ses fonds, pas de ce qu’une personne a mal fait.
3. **Aucune obligation présumée** entre partenaires (pas de « doit », pas de « à rembourser »). Les mots *dette*, *retard*, *déficit*, *remboursement* restent permis quand ils décrivent une réalité financière confirmée, jamais pour en déduire une obligation entre partenaires.
4. **Confidentialité** : une information personnelle n’apparaît jamais dans le foyer.
5. **Alertes fondées uniquement sur un risque financier vérifiable** (un solde qui ne couvre pas une échéance), sans désigner de responsable. Neutralité ne veut pas dire cacher un risque.

Interdits par défaut : podium ou classement des contributions, pourcentage d’effort, bilan « qui dépense le plus », couleur rouge associée à une personne, relance visant l’autre partenaire.

### 2.2 Formulations de référence

| Situation | À éviter | Texte Boussole |
|---|---|---|
| Versement non reçu | « Marc n’a pas payé » | « Versement prévu le 28 — réception non confirmée » |
| Compte commun insuffisant | « Sam doit ajouter 120 € » | « 120 € supplémentaires sont nécessaires avant le 1er pour couvrir les échéances prévues » |
| Paiement dépendant de versements | — | « Le paiement du loyer du 1er dépend de 2 versements encore attendus » |
| Enveloppe dépassée | « Vous dépensez trop ! » | « L’enveloppe Courses dépasse son montant prévu de 35 € » |
| Dépense avancée | « Marc doit 45 € à Sam » | « 90 € de courses payés par Sam depuis son compte personnel » |
| Transfert déclaré | « Sam attend son argent » | « Transfert de 50 € déclaré — réception à confirmer » |
| Versements du mois | « Sam participe moins que Marc » | « Versements reçus ce mois : Sam 600 € · Marc 800 € » |
| Budget négatif | « Votre gestion est mauvaise » | « Les dépenses prévues dépassent les fonds disponibles de 85 € » |
| Récapitulatif des avances | « Écart : 95 € » | Liste par personne + transferts confirmés + la phrase : « Ce récapitulatif décrit les mouvements enregistrés. Il ne détermine pas comment les dépenses doivent être réparties entre vous. » |

### 2.3 Situations délicates (départ, arrêt du partage)
Textes exacts :
- « Le partage de ce foyer a été désactivé. »
- « Les nouvelles informations de ce foyer ne seront plus partagées avec ce compte. »
- « Les données personnelles de chaque membre restent privées. »
- « Certaines informations déjà consultées ou enregistrées par un ancien membre peuvent rester en sa possession. »

Jamais de « Sam t’a exclu ». Les messages décrivent l’effet réel sur les accès, rien de plus.

### 2.4 Mise en œuvre testable
- `lib/household-copy.ts` exporte **tous** les textes du foyer, sous forme de constantes ou de fonctions pures (`contributionPending(memberName, date)`, `shortfallBefore(amountCents, date)`, `dependsOnContributions(label, date, count)`, etc.).
- `tests/household-copy.test.mjs` :
  1. parcourt toutes les constantes et appelle chaque fonction avec des valeurs d’exemple ;
  2. vérifie qu’aucun texte ne correspond aux motifs interdits (insensible à la casse, apostrophes droites et courbes) : `\b(te|vous|lui|me) doi(t|s|vent)\b`, `\bdoi(t|s|vent) (payer|verser|rembourser|ajouter)\b`, `n['’]a (pas|toujours pas) (payé|versé|remboursé)`, `\btrop dépensé\b`, `\brappelle[- ]lui\b`, `\bexclu(e)?\b`, `\bparticipe moins\b`, `\bmauvaise? gestion\b`, `\bà rembourser\b` ;
  3. vérifie les textes de la §2.2 et de la §2.3 mot pour mot.
- **Notifications** : la V1 n’en envoie aucune. Seuls des messages dans l’application, sur l’écran du foyer. Une future notification ne pourra viser que **ses propres** versements, sur option.

---

## 3. Modèle fonctionnel

### 3.1 Deux espaces
| | Espace **Personnel** | Espace **Foyer** |
|---|---|---|
| Stockage | Appareil + coffre chiffré personnel (`budget_vaults`, inchangé) | Appareil + éléments chiffrés du foyer (`household_records`) |
| Visible par | Toi seul | Les deux membres |
| Contient | Solde, revenus, charges, dettes, dépenses personnels ; **lignes miroir** des mouvements vers le foyer | Solde du compte commun, échéances, enveloppes, dépenses communes, objectifs, versements, avances, transferts |
| Vrai disponible | Individuel | Du compte commun |

Un sélecteur d’espace dans l’en-tête (« Personnel » / « Notre foyer ») choisit l’espace actif. Toutes les pages existantes (Aujourd’hui, Échéances, Budget, Dépenses, Où part notre argent…) travaillent sur l’espace actif.

### 3.2 Les cinq types de mouvements — règle d’or
**Boussole ne crée jamais une dépense, un revenu ou une dette parce que deux personnes se transfèrent de l’argent.**

| Mouvement | Dans le Foyer | Dans le Personnel de la personne concernée | Analyse « Où part l’argent » |
|---|---|---|---|
| **M1. Revenu ou dépense réels du compte commun** (loyer, courses payées avec la carte commune) | Charge, revenu ou dépense normaux ; modifie le solde commun | Rien | Comptés normalement dans le Foyer |
| **M2. Versement personnel → compte commun** | Rentrée attendue (incertaine) puis reçue ; crédite le solde commun une fois reçue | Charge « Versement au compte commun », catégorie `household`, certaine | **Jamais** comptés comme revenu ni dépense : ligne séparée « Virements vers le compte commun » dans le Personnel, exclue du total |
| **M3. Dépense commune avancée avec l’argent personnel** | Dépense marquée « payée par Sam depuis son compte personnel » : consomme l’enveloppe et figure dans l’analyse du Foyer, **ne débite pas** le solde commun | Dépense miroir catégorie `household`, débite le solde personnel | Comptée une seule fois, dans le Foyer. Dans le Personnel : ligne séparée « Avancé pour le foyer », exclue du total |
| **M4. Transfert entre partenaires** (ex. remboursement) | Mouvement « Marc → Sam, 50 € » : déclaré, puis confirmé par la personne qui reçoit. Ne touche ni le solde commun ni l’analyse | Chez l’émetteur : sortie dès la déclaration. Chez le destinataire : entrée **seulement après confirmation** | Jamais compté. Section séparée « Transferts entre vous » |
| **M5. Récapitulatif des avances** | Affichage seul : avances par personne et transferts confirmés, sans écart affiché | — | — |

Contribution nette (calculée, **jamais affichée comme une somme due**) : `avancesDe(X) − transfertsConfirmésReçusPar(X) + transfertsConfirmésÉmisPar(X)`. Elle sert aux tests et à un éventuel détail consultable.

### 3.3 Option « Nous n’avons pas de compte commun »
Réglage du foyer `hasJointAccount: false`. Le solde, le vrai disponible, les versements M2 et les échéances payées depuis le compte commun sont masqués. Restent : dépenses communes (toutes en M3), enveloppes, objectifs, transferts M4, récapitulatif M5, analyse.

---

## 4. Règles de calcul

**F1 — Versements attendus = rentrées incertaines.** Un versement M2 est un `Income` du foyer de type `household_contribution`, avec `isConfirmed: false` imposé. Le moteur actuel l’exclut déjà du chiffre prudent et l’inclut dans l’optimiste (`incomeOccurrences` : `isEstimated: !income.isConfirmed`). **Aucune modification du moteur.** Affichage Foyer :
- « **Disponible confirmé** » = `summary.trueAvailable` ;
- « **Avec les versements attendus** » = `summary.availableForecast.optimisticAvailable`.

**F2 — Versement reçu.** Un membre marque l’échéance du versement comme reçue (`recordPayment` type `income`, `balanceIncludesPayment: false`) : le solde commun augmente du montant ; l’échéance sort des versements attendus. Si le solde est recopié de la banque, le versement figure dans la liste « déjà passé » de `passedOccurrences` comme toute rentrée.

**F3 — Alerte de dépendance.** Si le point bas prudent est sous la réserve **et** qu’au moins un versement attendu tombe avant la date du point bas, afficher `dependsOnContributions(premièreCause, date, n)` avec `n` = nombre de versements attendus dont la date est `<=` la date du point bas. Sinon, si le point bas prudent est sous zéro : `shortfallBefore(−pointBas, date)`.

**F4 — Avance (M3).** `Spending` du foyer avec `paidFrom: 'personal'` et `paidBy: memberId`. `addSpending` ne débite **pas** le solde commun pour `paidFrom: 'personal'` (même si `balanceIncluded` est faux). La dépense compte dans `spentInMonth` (donc réduit la réservation d’enveloppe) et dans `analyzeMonth`. Elle est **exclue** du calcul « Non encodé » (R5 de P3) : elle n’a jamais touché le compte commun.

**F5 — Transfert (M4).** Entité `MemberTransfer { id, fromMemberId, toMemberId, amount, date, status: 'declared' | 'confirmed' | 'not_received', declaredAt, confirmedAt? }`. Seul le destinataire peut passer `declared` → `confirmed` ou `not_received`. Aucun effet sur le solde commun ni sur l’analyse du foyer.

**F6 — Lignes miroir personnelles.** Créées **par l’appareil de la personne concernée**, dans **son** espace Personnel, jamais par l’autre :
- M2 : `Expense { category: 'household', label: 'Versement au compte commun', amount, frequency, dueDate, isRecurring: true, linkedRecordId }`, mise à jour si le versement du foyer change ;
- M3 : `Spending { category: 'household', label: 'Avancé pour le foyer : <libellé>', amount, date, balanceIncluded: false, linkedRecordId }` ;
- M4 émetteur : `Spending { category: 'household', label: 'Transfert vers <prénom>', … }` dès la déclaration ;
- M4 destinataire : à la confirmation, `Income { type: 'household_transfer', frequency: 'one_time', isConfirmed: true, expectedDate: date, linkedRecordId }` immédiatement marqué reçu (crédite le solde personnel).
Idempotence : une ligne miroir n’est jamais créée deux fois pour le même `linkedRecordId` (vérification avant création, sur chaque appareil de la personne).

**F7 — Analyses.** `analyzeMonth` exclut des totaux et des lignes toute charge ou dépense de catégorie `household` et toute rentrée de type `household_*`. Nouveau champ `transfersCents` (Personnel) affiché sous les catégories : « Virements et avances pour le foyer : X € ».

**F8 — Conseils.** `AdviceWidget` et `/conseils` sont masqués dans l’espace Foyer en V1 (leurs textes n’ont pas été écrits pour deux personnes).

---

## 5. Architecture des données et synchronisation

### 5.1 Pourquoi pas le coffre actuel
`CloudSyncProvider` envoie un bloc chiffré unique et demande « Garder ce téléphone ou la copie en ligne » en cas de conflit (`decideSync` → `conflict`). À deux, deux dépenses saisies en même temps produiraient un conflit et l’une serait perdue. Le foyer utilise donc un stockage **élément par élément**. Le coffre personnel ne change pas.

### 5.2 Tables Supabase (migration `supabase/migrations/<horodatage>_households.sql`)
```sql
create table public.households (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  key_version integer not null default 1 check (key_version > 0),
  last_seq bigint not null default 0
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  member_id uuid not null default gen_random_uuid(),   -- identifiant public dans les éléments chiffrés
  wrapped_key text,                                    -- clé du foyer chiffrée par la clé personnelle du membre
  key_version integer not null default 1,
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (household_id, user_id),
  unique (household_id, member_id)
);

create table public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  token_hash text not null check (char_length(token_hash) = 64),  -- SHA-256 hexadécimal
  created_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz
);

create table public.household_records (
  household_id uuid not null references public.households (id) on delete cascade,
  record_id uuid not null,
  seq bigint not null,                    -- ordre attribué par le serveur
  key_version integer not null,
  ciphertext text not null check (char_length(ciphertext) between 16 and 200000),
  iv text not null check (char_length(iv) between 8 and 64),
  deleted boolean not null default false,
  updated_by uuid not null references auth.users (id),
  updated_at timestamptz not null default now(),
  primary key (household_id, record_id)
);
create index household_records_seq on public.household_records (household_id, seq);
```
- RLS activée sur les quatre tables, aucun droit pour `anon`.
- Fonction `is_active_member(h uuid)` (`security definer`, `search_path = ''`) : vrai si `auth.uid()` a une ligne `household_members` avec `removed_at is null`.
- `households`, `household_records` : `select` si `is_active_member`. **Aucune écriture directe** : uniquement via les fonctions ci-dessous.
- `household_members` : `select` des lignes de ses foyers actifs ; la colonne `wrapped_key` d’un autre membre n’est **jamais** renvoyée (vue `household_members_public` sans `wrapped_key`, ou fonction `my_wrapped_key(h)`).
- `household_invitations` : aucun `select` direct.

Fonctions (`security definer`, `search_path = ''`, `revoke` à `public`/`anon`, `grant execute` à `authenticated`) :
- `create_household(wrapped_key text) returns table(household_id uuid, member_id uuid)` — crée le foyer et le premier membre.
- `create_invitation(h uuid, token_hash text) returns uuid` — membre actif ; refusé si le foyer compte déjà 2 membres actifs ; invalide les invitations non utilisées précédentes du foyer.
- `accept_invitation(invitation uuid, token text, wrapped_key text) returns table(household_id uuid, member_id uuid)` — vérifie `encode(sha256(convert_to(token, 'UTF8')), 'hex') = token_hash`, `used_at is null`, `expires_at > now()`, moins de 2 membres actifs, appelant pas déjà membre actif ; insère le membre, marque l’invitation utilisée. Messages d’erreur génériques (« Cette invitation n’est plus valable. »).
- `upsert_records(h uuid, records jsonb) returns table(record_id uuid, seq bigint)` — membre actif ; **verrouille la ligne `households`** (`select … for update`), attribue `last_seq + 1, + 2, …` dans l’ordre du tableau, met à jour `last_seq`, fait un `insert … on conflict (household_id, record_id) do update`. Refuse un `key_version` différent de celui du foyer. 500 éléments au plus par appel.
- `pull_records(h uuid, after_seq bigint) returns setof household_records` — membre actif ; `seq > after_seq` trié par `seq`, 1 000 lignes au plus par appel.
- `leave_household(h uuid)`, `stop_sharing_with(h uuid, other_member uuid)` — met `removed_at = now()` et `wrapped_key = null` sur la ligne visée (soi-même, ou l’autre membre). Tout membre actif peut arrêter le partage avec l’autre.
- `begin_key_rotation(h uuid) returns integer` — membre actif ; incrémente `key_version`, renvoie la nouvelle version. `set_my_wrapped_key(h uuid, wrapped_key text, key_version integer)`.
- `delete_my_account()` existant : étendu pour retirer d’abord l’appelant de ses foyers (`removed_at`), puis supprimer le compte.

Le verrou sur `households` garantit que l’ordre des `seq` est l’ordre de validation : un client qui tire `seq > dernier_vu` ne manque jamais un élément.

### 5.3 Éléments chiffrés
Chaque élément = `{ kind, id, data, updatedBy: memberId, updatedAt }` chiffré en AES-GCM 256 avec la clé du foyer, **données additionnelles authentifiées** `"${household_id}|${record_id}|${key_version}"` (empêche de déplacer un élément d’un foyer ou d’un identifiant à l’autre). `record_id` = identifiant de l’entité (UUID), ou dérivé pour les éléments composés (voir `occurrence`).

| `kind` | Contenu | Fusion |
|---|---|---|
| `settings` | nom du foyer, réserve, `hasJointAccount` (id fixe dérivé du foyer, voir ci-dessous) | dernière écriture gagne |
| `member` | `memberId`, prénom affiché | dernière écriture gagne |
| `income`, `expense`, `debt`, `envelope`, `goal`, `spending`, `transfer`, `gap` | l’entité, montants en centimes, **sans** `occurrenceStatuses` | dernière écriture gagne par élément |
| `occurrence` | `{ entityKind, entityId, dueDate, status }`, id dérivé de `entityKind|entityId|dueDate` | dernière écriture gagne ; suppression = statut retiré |
| `checkpoint` | solde recopié de la banque : `{ amount, date, revision }` (id fixe) | dernière écriture gagne |
| `effect` | variation de solde : `{ checkpointId, deltaCents }` | **ajout seul**, jamais modifié |

Suppression = élément `deleted: true` dont le contenu chiffré ne garde que `{ kind, id }`.

Identifiant dérivé (sans dépendance) : les 16 premiers octets de `SHA-256(householdId + '|' + clé)` via `crypto.subtle.digest`, formatés en UUID (version et variante forcées à 5 et RFC 4122). Fonction `derivedRecordId(householdId, key)` dans `lib/household-records.ts`, testée.

### 5.4 Le solde commun ne se stocke pas, il se calcule
Si le solde était un élément « dernière écriture gagne », deux dépenses simultanées (Sam −65 €, Marc −40 €, chacun partant de 500 €) donneraient 435 € ou 460 € au lieu de 395 €. Règle :

`soldeCommun = checkpoint.amount + Σ effect.deltaCents pour les effets dont checkpointId = checkpoint.id`

- Recopier le solde de la banque (`updateBalance`) écrit un nouveau `checkpoint` ; les effets rattachés à l’ancien sont ignorés (ils sont déjà dans le solde bancaire), exactement comme la règle R6 de P3.
- Toute autre action qui change `currentBalance` (dépense débitée, « Payé », « Reçu », paiement de dette, suppression d’une dépense) ajoute un `effect` du delta.
- Deux recopies simultanées : la dernière validée par le serveur gagne ; les effets rattachés à la perdante sont ignorés.

### 5.5 Écrire sans réécrire le moteur : la différence d’états
L’espace Foyer réutilise **le même réducteur** que l’espace Personnel. Après chaque action dans le foyer :
1. `next = reduceBudget(previous, action)` : la fonction existe dans `lib/context/AppContext.tsx` mais n’est pas exportée. La PR 2 la déplace telle quelle dans `lib/budget-reducer.ts` (avec le type `AppAction`), sans changer son comportement, et `AppContext` l’importe ;
2. `diffHousehold(previous, next, context)` (fonction pure, `lib/household-diff.ts`) produit la liste des éléments à écrire : entités ajoutées, modifiées ou supprimées par `id` ; statuts d’échéance ajoutés ou retirés ; nouveau `checkpoint` si `balanceRevision` a changé, sinon un `effect` si `currentBalance` a changé ; écarts de solde ;
3. ces éléments sont chiffrés, ajoutés à la file d’envoi locale et appliqués localement tout de suite.

Matérialisation inverse : `materializeHousehold(records): AppState` (fonction pure) reconstruit un `AppState` à partir des éléments déchiffrés (entités + `occurrenceStatuses` reconstitués + solde calculé selon §5.4). Le moteur (`calculateBudgetSummary`, `analyzeMonth`, etc.) tourne dessus sans modification.

Propriété testée : pour toute action `a`, `materialize(records ∪ diff(prev, reduce(prev, a))) ≡ reduce(prev, a)` (égalité des sérialisations).

### 5.6 Hors ligne, envoi et réception
- File d’envoi locale (IndexedDB, clé `boussole-household-queue-<householdId>`), éléments identifiés par `record_id` + un `writeId` aléatoire : un renvoi après coupure est **idempotent**.
- Réception : `pull_records(after_seq)` à l’ouverture, au retour en ligne, au retour sur l’application et toutes les 30 secondes tant que l’espace Foyer est affiché. Pas de Supabase Realtime en V1.
- Les éléments reçus remplacent la version locale d’un même `record_id` si leur `seq` est plus grand ; les éléments locaux non encore envoyés restent prioritaires à l’affichage jusqu’à leur accusé de réception.
- Limite connue et documentée : deux modifications **du même élément** (ex. le montant du loyer) en même temps → la dernière validée gagne. Deux dépenses, deux statuts, deux effets ne sont **jamais** le même élément, donc jamais perdus.
- Limite connue : deux paiements simultanés **de la même dette** peuvent écraser le restant dû l’un de l’autre (élément `debt` en dernière écriture). Cas rare, à revoir en V2 si besoin.

---

## 6. Clés, invitations, départ

### 6.1 Clé du foyer
- Création : AES-GCM 256 générée sur l’appareil (`crypto.subtle.generateKey`, extractible le temps de l’emballer), puis gardée **non extractible** dans IndexedDB (même trousseau que `lib/cloud-remote.ts`, clé `household-<id>-v<version>`).
- **Prérequis** : la synchronisation personnelle doit être active (compte + phrase secrète, `/synchronisation`). La clé du foyer est chiffrée avec la clé personnelle du membre (`encryptText` de `lib/cloud-crypto.ts`) et stockée dans `household_members.wrapped_key`. Sur un nouvel appareil, la phrase secrète personnelle suffit pour retrouver le foyer.

### 6.2 Invitation
- Lien : `https://<origine>/foyer/rejoindre#i=<invitationId>&t=<jeton>&k=<clé en base64url>`. **Tout est après le `#`** : rien n’est envoyé au serveur par la navigation. Le jeton (32 octets aléatoires) n’est transmis qu’à `accept_invitation`, qui le compare à son empreinte. La clé n’est **jamais** transmise.
- Envoi par la personne qui invite, avec `navigator.share` (repli : bouton copier). Texte d’aide : « Envoie ce lien uniquement à la personne avec qui tu partages ce foyer. Il est valable 7 jours, une seule fois. »
- Accepter : connexion par code e-mail, déverrouillage de la synchronisation personnelle, `accept_invitation`, emballage de la clé avec sa clé personnelle (`set_my_wrapped_key`), premier `pull_records(0)`.
- Après acceptation, les deux membres voient « Ce foyer est partagé avec <prénom> ».
- Choix de la clé dans le lien : un lien intercepté donne accès au foyer pendant 7 jours au plus et une seule fois. C’est assumé et écrit dans la page Confidentialité ; l’invitation peut être annulée.

### 6.3 Arrêter le partage, quitter
- « **Quitter le foyer** » (`leave_household`) ou « **Arrêter le partage avec <prénom>** » (`stop_sharing_with`). Confirmation en ligne avec les textes §2.3.
- Juste après, l’appareil du membre restant lance le **renouvellement de la clé** : `begin_key_rotation`, nouvelle clé, rechiffrement de **tous** les éléments par lots via `upsert_records`, `set_my_wrapped_key`. Reprise automatique si l’opération est interrompue (la version de clé du foyer indique qu’elle n’est pas terminée).
- La personne qui n’a plus accès garde sur son appareil une **copie en lecture seule** du foyer, datée, qu’elle peut télécharger (fichier JSON au format de `Sauvegarde`) ou effacer. Ses lignes miroir personnelles restent dans son espace Personnel : c’est son historique.
- Ce qui ne peut pas être garanti, et doit être écrit : les informations déjà consultées ou enregistrées par un ancien membre peuvent rester en sa possession.

### 6.4 Ce que le serveur sait
Que deux comptes partagent un foyer, quand des éléments sont écrits et par quel compte, combien il y en a. Rien d’autre. À ajouter dans `app/confidentialite/page.tsx`.

---

## 7. Interface

- **Sélecteur d’espace** dans `TopHeader` : « Personnel » / « Notre foyer » (prénom du foyer si défini). Mémorisé par appareil.
- **`/foyer`** (Plus → Foyer) : créer un foyer, inviter, membres, mon versement, option compte commun, quitter, arrêter le partage, copie en lecture seule.
- **`/foyer/rejoindre`** : accepter une invitation.
- **Aujourd’hui (Foyer)** : « Disponible confirmé », « Avec les versements attendus », prochains mouvements (versements « Réception à confirmer », échéances), point d’attention F3, enveloppes. Exemple de maquette validé dans la relecture du 21 novembre.
- **Saisie rapide (Foyer)** : case « Payé avec mon argent personnel » (M3).
- **`/foyer/mouvements`** : versements du mois par personne, transferts (déclarer, confirmer, « Pas reçu »), récapitulatif des avances avec la phrase de neutralité. Non affiché sur l’accueil.
- **Chaque élément** du foyer affiche « Ajouté par <prénom> » dans son détail.
- Tous les textes depuis `lib/household-copy.ts`.

---

## 8. Découpage en PR

| PR | Chantier | Condition de validation (démontrée par test) |
|---|---|---|
| 1 | Fondations : migration, RLS, fonctions, chiffrement des éléments, clé du foyer, emballage, jeton d’invitation (bibliothèque seule) | Un compte non membre ou retiré ne lit **aucun** élément ; aucune fonction ne touche `budget_vaults` ; l’invitation est à usage unique, expire, refuse un 3ᵉ membre ; un élément déplacé d’identifiant ne se déchiffre pas |
| 2 | Budget commun et synchronisation : éléments, `diffHousehold`, `materializeHousehold`, solde par points de départ et effets, file hors ligne, sélecteur d’espace, foyer à un membre sur plusieurs appareils | Aucune dépense perdue lors de modifications simultanées ; solde commun exact quel que soit l’ordre d’arrivée ; renvoi idempotent |
| 3 | Versements (M2) et lignes miroir, alerte F3, affichage confirmé / attendu | Aucun double comptage ; versements attendus distingués des reçus ; textes conformes à la charte |
| 4 | Avances (M3), transferts (M4), confirmation, récapitulatif (M5), option sans compte commun | Soldes, analyses et contributions nettes exacts (scénario F-B) ; une entrée personnelle n’apparaît qu’après confirmation |
| 5 | Invitations (écrans), départ, arrêt du partage, renouvellement de la clé, copie en lecture seule, page Confidentialité | Accès révoqués, clé renouvelée, données du membre restant préservées, aucun texte interdit |

La durée n’est pas figée avant l’audit de ce plan. La PR 1 et la PR 5 incluent une vérification sur la vraie base Supabase avec deux comptes jetables, supprimés ensuite.

---

## 9. Scénarios chiffrés

En tête de chaque fichier : `process.env.TZ = 'Europe/Brussels'`. Réserve 50 € sauf mention contraire. Horizon du vrai disponible : 35 jours.

**F-A. Versements attendus (corrections C et F1–F3) — vérifié avec le moteur actuel.**
Le 25/11/2026, compte commun 500 € (recopié le 25/11). Loyer 900 €/mois dû le 01/12. Versements mensuels attendus le 28 : Sam 300 €, Marc 300 € (`isConfirmed: false`).
- Disponible confirmé : **−450 €** (point bas le 01/12 à −400 €).
- Avec les versements attendus : **150 €**.
- Versements attendus dans l’horizon : **4**, total **1 200 €** (28/11 et 28/12).
- Alerte F3 : « Le paiement du loyer du 1er dépend de 2 versements encore attendus » (versements du 28/11 seulement, avant le point bas).
- Le versement de Sam du 28/11 marqué reçu : solde **800 €**, disponible confirmé **−150 €**, avec versements attendus **150 €**, versements attendus **3** pour **900 €**.

**F-B. Avances et transferts (corrections A, B, D) — vérifié pour le foyer.**
Le 20/11/2026, compte commun 1 000 € (recopié le 10/11), enveloppe Courses du foyer 400 €/mois. Sam avance 135 € (12/11), Marc avance 40 € (15/11), toutes deux `paidFrom: 'personal'`. Le 20/11, Marc déclare un transfert de 50 € à Sam ; Sam le confirme le 21/11.
- Solde commun : **1 000 €** (inchangé par les avances et le transfert).
- Disponible confirmé du foyer : **150 €** avant les avances, **325 €** après (l’enveloppe ne réserve plus que 225 €).
- Analyse du foyer, novembre : Courses **175 €** ; le transfert n’apparaît dans aucun total.
- Récapitulatif : avances Sam **135 €**, Marc **40 €** ; transfert confirmé Marc → Sam **50 €**. Aucun écart affiché.
- Contributions nettes (test seulement) : Sam **85 €**, Marc **90 €**.
- Personnel de Sam : −135 € à l’avance ; **+50 € seulement après confirmation** (avant : aucun changement).
- Personnel de Marc : −40 € à l’avance, −50 € dès la déclaration.
- Analyses personnelles : ni les avances ni le transfert dans le total des dépenses ; `transfersCents` Sam = 13 500 (avance) et entrée de 5 000 en section « Transferts » ; Marc = 9 000.
- Variante « Pas reçu » : Sam choisit « Pas reçu » → statut `not_received`, aucune entrée chez Sam, la sortie de Marc reste (c’est son geste ; il peut supprimer sa déclaration, ce qui supprime sa ligne miroir).

**F-C. Versement lié sans double comptage (correction B).**
Personnel de Sam : solde 2 000 €, versement mensuel de 800 € au compte commun le 28. Ligne miroir : charge `household` de 800 €, **certaine** dans le vrai disponible personnel. Analyse personnelle de novembre après paiement : total des dépenses **sans** les 800 € ; ligne « Virements et avances pour le foyer : 800 € ». Foyer : rentrée attendue de 800 €, comptée seulement dans « Avec les versements attendus ».

**F-D. Modifications simultanées (correction E).**
Foyer à 500 € (point de départ P1). Appareil A hors ligne ajoute une dépense commune de 65 € ; appareil B hors ligne ajoute 40 €. Les deux reviennent en ligne dans un ordre quelconque :
- deux dépenses présentes, solde **395 €** dans les deux ordres ;
- renvoi du même lot par A après coupure : toujours deux dépenses, toujours 395 € ;
- A modifie le montant du loyer à 950 € pendant que B le modifie à 920 € : les deux appareils convergent vers la valeur validée en dernier, et le détail indique qui l’a modifiée ;
- A recopie le solde bancaire (400 €, point de départ P2) pendant que B ajoute une dépense de 20 € rattachée à P1 : solde **400 €** (l’effet de B appartient à P1, déjà inclus dans le solde bancaire).
Propriété : pour chaque action du réducteur couverte par les tests P0–P3, `materialize(records ∪ diff) ≡ reduce`.

**F-E. Sécurité et accès (PR 1 et 5).**
Sur une base de test : un non-membre ne lit aucun élément, aucun membre, aucune invitation ; un membre ne lit jamais le `wrapped_key` de l’autre ; une invitation expirée, déjà utilisée ou pour un 3ᵉ membre est refusée ; après `stop_sharing_with`, l’ancien membre ne lit plus rien, même avec un `after_seq` de 0 ; après renouvellement, tous les éléments ont la nouvelle `key_version` et ne se déchiffrent pas avec l’ancienne clé ; `budget_vaults` reste inaccessible entre membres.

**F-F. Charte (§2.4).** Tous les textes de `household-copy.ts` et ceux générés pour F-A à F-D passent le filtre des motifs interdits ; les textes §2.2 et §2.3 sont exacts.

---

## 10. Prérequis et décisions hors code

1. **Envoi des e-mails** : configurer Resend comme SMTP de Supabase avec les modèles français (`{{ .Token }}`) avant toute invitation réelle.
2. **Supabase Pro** (sauvegardes quotidiennes, pas de mise en pause) et **accord de traitement des données** signé avant d’ouvrir le foyer à de vrais couples.
3. **Vercel Pro** pour un usage commercial, à vérifier côté équipe Start’OnLab.
4. **Offre** : Foyer gratuit pendant le pilote ; prix test envisagé 2,99 €/mois TTC par foyer ou 29 €/an, à valider auprès des testeurs. Pas de paiement en V1.
5. **Page Confidentialité** : ce que le serveur sait (§6.4), le choix du lien d’invitation (§6.2), ce qui reste chez un ancien membre (§2.3).
