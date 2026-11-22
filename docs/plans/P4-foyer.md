# P4 — Foyer : un budget commun à deux, des finances personnelles privées

Plan de conception, **pas encore de développement**. Il intègre les corrections A à E et la charte éditoriale issues de la relecture du 21 novembre 2026. Il a été confronté au code de `main` au commit `cefe1ff` : chaque fonction citée existe, et chaque attendu chiffré de la section 9 marqué « vérifié » a été recalculé avec le moteur actuel.

### Révision du 22 novembre 2026

La gestion des clés et la suppression de compte sont alignées sur le parcours de compte de `main` (`875e277`). Capiste gère une clé par foyer. Une connexion au compte suffit pour retrouver un foyer dont on est toujours membre. Les entrées partagées sont conservées pour le membre restant après une suppression de compte, avec « Ancien membre » à la place du nom de l’auteur supprimé. Le départ du dernier membre supprime le foyer côté serveur.

Avant la PR 2, la relecture de `main` (`404e458`) a confirmé trois corrections (§5.2 à §5.6). Le serveur conserve les identifiants des écritures déjà acceptées. Chaque recopie du solde a son propre identifiant. Le Foyer dérive ses UUID de synchronisation à partir des identifiants du moteur.

Lors de la PR 2, le calcul du solde a été précisé. L’effet est chiffré dans l’opération qui le produit. Quand deux appareils enregistrent la même opération, la version retenue remplace ensemble son état et son effet (§5.4).

Signature du mode : **« Votre budget commun, en toute transparence. Les finances personnelles de chacun restent privées. »**

---

## 0. Consignes pour l’agent de code

Les consignes transversales de `docs/plans/P3-depenses-enveloppes.md` §0 s’appliquent (une PR à la fois, tests d’abord, aucun attendu existant modifié, centimes, dates Europe/Brussels, aucune dépendance npm nouvelle, français et tutoiement, accessibilité, quatre commandes avant chaque PR). Les appels Supabase du Foyer et sa route de restitution de clé sont définis aux §5.2 et §6.1. En plus :

1. **L’application chiffre chaque élément du foyer sur l’appareil avant son envoi.** Les montants, libellés, dates de budget et prénoms sont transmis et stockés sous forme chiffrée. Capiste gère la clé et peut déchiffrer ces éléments (§6.4).
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
- départ, arrêt du partage et copie en lecture seule pour la personne qui n’a plus accès.

Hors périmètre V1 : plus de 2 membres, paiement de l’offre (Stripe), notifications push, import bancaire, calcul d’une répartition « juste » (50/50 ou au prorata), conseils automatiques dans le foyer, renouvellement des clés du Foyer.

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
| Visible dans l’application par | Le titulaire du compte | Les membres actifs, avec une copie locale figée possible pour un ancien membre (§6.3) |
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
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (household_id, record_id)
);
create index household_records_seq on public.household_records (household_id, seq);
```
- RLS activée sur les quatre tables, aucun droit pour `anon`.
- Fonction `is_active_member(h uuid)` (`security definer`, `search_path = ''`) : vrai si `auth.uid()` a une ligne `household_members` avec `removed_at is null`.
- `households`, `household_records` : `select` si `is_active_member`. **Aucune écriture directe** : uniquement via les fonctions ci-dessous.
- `household_members` : `select` des lignes des foyers dont l’appelant est membre actif. Une ligne de membre contient des identifiants et des dates d’adhésion.
- `household_invitations` : aucun `select` direct.

La PR 2 ajoute `household_writes` dans une nouvelle migration. La table associe `household_id`, `write_id` (UUID), `record_id`, `seq` et `accepted_at`. Sa clé primaire est `(household_id, write_id)`. La RLS est activée et les rôles d’API n’ont aucun accès direct. Les écritures acceptées sont conservées pendant toute la vie du foyer en V1 et supprimées en cascade à sa suppression.

Fonctions (`security definer`, `search_path = ''`, `revoke` à `public`/`anon`, `grant execute` à `authenticated`) :
- `create_household() returns table(household_id uuid, member_id uuid)` — crée le foyer et le premier membre dans la même transaction.
- `create_invitation(h uuid, token_hash text) returns uuid` — membre actif ; refusé si le foyer compte déjà 2 membres actifs ; invalide les invitations non utilisées précédentes du foyer.
- `revoke_invitation(h uuid, invitation uuid)` — membre actif ; invalide une invitation ouverte du foyer.
- `accept_invitation(invitation uuid, token text) returns table(household_id uuid, member_id uuid)` — vérifie `encode(sha256(convert_to(token, 'UTF8')), 'hex') = token_hash`, `used_at is null`, `expires_at > now()`, l’adhésion active de la personne qui invite, moins de 2 membres actifs et l’absence d’adhésion active de l’appelant. Insère le membre ou réactive sa ligne existante, puis marque l’invitation utilisée dans la même transaction. Message d’erreur générique « Cette invitation n’est plus valable. »
- `upsert_records(h uuid, records jsonb) returns table(record_id uuid, seq bigint)` — **verrouille la ligne `households`** (`select … for update`) et vérifie que l’appelant est membre actif. Chaque élément porte un `write_id`. Un `write_id` déjà accepté pour le même élément reçoit le `seq` d’origine, sans nouvelle écriture. Pour les nouveaux `write_id`, attribue `last_seq + 1, + 2, …` dans l’ordre du tableau, écrit l’élément avec `insert … on conflict (household_id, record_id) do update` et inscrit le reçu dans `household_writes`. Met à jour `last_seq` dans la même transaction. Renseigne `created_by` à l’insertion et `updated_by` à chaque nouvelle écriture avec `auth.uid()`. Refuse une nouvelle écriture si sa `key_version` diffère de celle du foyer. 500 éléments au plus par appel.
- `pull_records(h uuid, after_seq bigint) returns setof household_records` — membre actif ; `seq > after_seq` trié par `seq`, 1 000 lignes au plus par appel.
- `leave_household(h uuid)`, `stop_sharing_with(h uuid, other_member uuid)` — met `removed_at = now()` sur l’adhésion visée. Tout membre actif peut quitter le foyer ou arrêter le partage avec l’autre.
- `delete_my_account()` verrouille les foyers de l’appelant dans l’ordre de leurs identifiants avant de supprimer le compte. Les adhésions sont effacées en cascade. Les entrées partagées conservées ont `created_by` ou `updated_by` à `null` quand la référence désignait ce compte.

Les opérations d’invitation, d’adhésion et de retrait prennent le même verrou sur `households` avant de vérifier les droits et le nombre de membres actifs. Après un retrait ou une suppression d’adhésion, un déclencheur supprime le foyer s’il reste zéro membre actif. Les entrées et invitations de ce foyer sont alors supprimées en cascade. Le déclencheur ignore un foyer déjà en cours de suppression.

Quand une adhésion est supprimée avec le compte, le déclencheur efface aussi l’élément de profil chiffré du membre (§5.3) dans un foyer conservé. Les entrées financières et les `memberId` nécessaires à l’historique des mouvements sont conservés. Au retour en ligne, la liste d’adhésions prévaut sur les prénoms en cache pour déterminer quels profils restent utilisables.

Le verrou sur `households` garantit que l’ordre des `seq` est l’ordre de validation : un client qui tire `seq > dernier_vu` ne manque jamais un élément.

### 5.3 Éléments chiffrés
Chaque élément contient `{ kind, id, data, balanceEffect? }`, chiffré en AES-GCM 256 avec la clé du foyer. Les **données additionnelles authentifiées** `"${household_id}|${record_id}|${key_version}"` empêchent de déplacer un élément d’un foyer ou d’un identifiant à l’autre. Le contenu chiffré conserve l’identifiant du moteur. L’UUID de synchronisation `record_id` est calculé par ``derivedRecordId(householdId, `${kind}|${engineId}`)``. L’attribution des écritures vient des colonnes renseignées par le serveur au §5.2.

| `kind` | Contenu | Fusion |
|---|---|---|
| `settings` | nom du foyer, réserve, `hasJointAccount` (id fixe dérivé du foyer, voir ci-dessous) | dernière écriture gagne |
| `member` | `memberId`, prénom affiché. Clé de dérivation composée de `member`, d’une barre verticale et du `memberId`, comme dans le déclencheur SQL de suppression de compte | dernière écriture gagne |
| `income`, `expense`, `debt`, `envelope`, `goal`, `spending`, `transfer`, `gap` | l’entité, montants en centimes, **sans** `occurrenceStatuses` | dernière écriture gagne par élément |
| `occurrence` | `{ entityKind, entityId, dueDate, status, paymentDate? }`, identifiant du moteur composé du type, de l’identifiant de l’entité et de la date, séparés par des barres verticales | dernière écriture gagne ; suppression = statut retiré |
| `child-expense`, `merchant` | frais des enfants saisis dans le Foyer en centimes, et catégories de commerces mémorisées à partir des dépenses du Foyer | dernière écriture gagne par élément |
| `debt-payment` | paiement de dette hors échéance, avec son identifiant, sa date et son effet | dernière écriture gagne par opération |
| `checkpoint` | solde recopié de la banque sous la forme `{ checkpointId, amount, date }`, avec un UUID aléatoire distinct pour chaque relevé | ajout seul ; le plus grand `seq` désigne le relevé actif |

Une opération qui change le solde porte son `balanceEffect: { checkpointId, deltaCents }` dans le même élément chiffré. Une suppression porte `deleted: true` et son contenu chiffré contient uniquement `{ kind, id }`.

Identifiant dérivé (sans dépendance) : les 16 premiers octets de `SHA-256(householdId + '|' + clé)` via `crypto.subtle.digest`, formatés en UUID (version et variante forcées à 5 et RFC 4122). Fonction `derivedRecordId(householdId, key)` dans `lib/household-records.ts`, testée.

### 5.4 Le solde commun ne se stocke pas, il se calcule
Si le solde était un élément « dernière écriture gagne », deux dépenses simultanées (Sam −65 €, Marc −40 €, chacun partant de 500 €) donneraient 435 € ou 460 € au lieu de 395 €. Règle :

`soldeCommun = checkpoint.amount + Σ balanceEffect.deltaCents` pour les dernières versions des éléments non supprimés dont l’effet se rattache au relevé actif.

- Recopier le solde de la banque (`updateBalance`) ajoute un relevé avec un nouveau `checkpointId`. Chaque dépense débitée rattache son effet au relevé actif à sa saisie. Une modification remplace le montant débité en entier et conserve ce rattachement. Le moteur utilise l’identité du relevé pour appliquer la règle R6 de P3.
- Une échéance payée, une dépense ou une autre opération financière utilise un seul identifiant. Le plus grand `seq` remplace ensemble l’état de cette opération et `balanceEffect`. Deux marquages de la même échéance comptent une fois. Les effets d’opérations distinctes s’additionnent.
- Une échéance remise à « non payée » ou une dépense supprimée retire l’effet de l’opération. Une échéance dont le paiement était déjà compris dans le solde recopié est payée sans effet sur ce relevé.
- Après deux recopies simultanées, le relevé actif est celui dont le `seq` est le plus grand, indépendamment de la date de solde saisie. Les effets rattachés à l’autre relevé sont ignorés.

### 5.5 Écrire sans réécrire le moteur : la différence d’états
L’espace Foyer réutilise **le même réducteur** que l’espace Personnel. Après chaque action dans le foyer :
1. `next = reduceBudget(previous, action)` : la fonction existe dans `lib/context/AppContext.tsx` mais n’est pas exportée. La PR 2 la déplace telle quelle dans `lib/budget-reducer.ts` (avec le type `AppAction`), sans changer son comportement, et `AppContext` l’importe ;
2. `diffHousehold(previous, next, context)` (fonction pure, `lib/household-diff.ts`) produit la liste des éléments à écrire : entités ajoutées, modifiées ou supprimées par `id`, statuts d’échéance ajoutés ou retirés, écarts de solde, nouveau `checkpoint` si `balanceRevision` a changé. Chaque opération qui change le solde écrit son impact complet dans son propre élément.
3. ces éléments sont chiffrés, ajoutés à la file d’envoi locale et appliqués localement tout de suite.

Matérialisation inverse : `materializeHousehold(records): AppState` (fonction pure) reconstruit un `AppState` à partir des éléments déchiffrés (entités + `occurrenceStatuses` reconstitués + solde calculé selon §5.4). Le moteur (`calculateBudgetSummary`, `analyzeMonth`, etc.) tourne dessus sans modification.

Propriété testée : pour toute action `a`, `materialize(records ∪ diff(prev, reduce(prev, a))) ≡ reduce(prev, a)` (égalité des sérialisations).

### 5.6 Hors ligne, envoi et réception
- La file d’envoi locale en IndexedDB conserve le `record_id` et le `write_id` aléatoire de chaque écriture. Un renvoi après coupure réutilise le même `write_id` et reçoit le `seq` d’origine si le serveur a déjà accepté cette écriture (§5.2). Une écriture réellement nouvelle sur le même élément reste soumise à la règle de la dernière écriture validée.
- Réception : `pull_records(after_seq)` à l’ouverture, au retour en ligne, au retour sur l’application et toutes les 30 secondes tant que l’espace Foyer est affiché. Pas de Supabase Realtime en V1.
- Les éléments reçus remplacent la version locale d’un même `record_id` si leur `seq` est plus grand ; les éléments locaux non encore envoyés restent prioritaires à l’affichage jusqu’à leur accusé de réception.
- Deux modifications du même élément convergent vers la dernière validée, y compris son effet sur le solde. Les éléments d’opérations distinctes sont conservés et leurs effets se cumulent.
- Limite connue : deux paiements simultanés **de la même dette** peuvent écraser le restant dû l’un de l’autre (élément `debt` en dernière écriture). Cas rare, à revoir en V2 si besoin.

---

## 6. Clés, invitations, départ

### 6.1 Clé du foyer
- La route `POST /api/household-key` dérive une clé AES-GCM 256 propre au foyer avec `HMAC-SHA256(BUDGET_VAULT_MANAGED_KEY_V1, 'capiste-household-vault:v1:' + householdId)`. L’identifiant est lu dans la ligne du foyer autorisée par Supabase. Cette étiquette sépare les clés du Foyer de celles du budget personnel. Le secret racine reste côté serveur et `key_version` vaut 1 en V1.
- La route valide le jeton de connexion auprès de Supabase Auth et lit le foyer avec ce même jeton et la clé publique Supabase. La règle RLS sur `households` réserve cette lecture aux membres actifs. Une requête portant sur un foyer absent ou inaccessible reçoit le même refus. La route utilise uniquement les droits du compte connecté.
- La réponse et la requête cliente sont exclues du cache. La clé et le jeton sont exclus des journaux. Sur l’appareil, la clé est importée comme **non extractible** et le trousseau IndexedDB l’associe au compte, au foyer et à la version.
- Sur un nouvel appareil, une connexion au compte suffit pour retrouver ses foyers actifs. Le parcours est indépendant de l’état de la synchronisation personnelle et du mode de clé d’un éventuel coffre personnel.

### 6.2 Invitation
- Lien `https://<origine>/foyer/rejoindre#i=<invitationId>&t=<jeton>`. L’identifiant et le jeton sont après le `#` et restent côté navigateur pendant la navigation. Le jeton de 32 octets aléatoires, encodé en base64url, est transmis à `accept_invitation`, qui le compare à son empreinte. Le lien contient uniquement l’identifiant d’invitation et le jeton.
- Envoi par la personne qui invite, avec `navigator.share` (repli : bouton copier). Texte d’aide : « Envoie ce lien uniquement à la personne avec qui tu partages ce foyer. Il est valable 7 jours, une seule fois. »
- Pour accepter, la personne se connecte à son propre compte. Après succès de `accept_invitation`, son appareil demande la clé du foyer et effectue le premier `pull_records(0)`.
- Après acceptation, les deux membres voient « Ce foyer est partagé avec <prénom> ».
- Une autre personne qui obtient un lien encore valide peut accepter l’invitation avec son propre compte. Le lien expire après 7 jours et peut être annulé avant acceptation. Ce risque figure dans la page Confidentialité.

### 6.3 Arrêter le partage, quitter
- « **Quitter le foyer** » (`leave_household`) ou « **Arrêter le partage avec <prénom>** » (`stop_sharing_with`). Confirmation en ligne avec les textes §2.3.
- Après validation du retrait, les nouvelles demandes de clé, de lecture et d’écriture de l’ancien membre sont refusées. Le membre restant conserve son accès. La clé reste à la version 1 durant la V1.
- La personne qui n’a plus accès garde sur son appareil une **copie en lecture seule** du foyer, datée, qu’elle peut télécharger (fichier JSON au format de `Sauvegarde`) ou effacer. Ses lignes miroir personnelles restent dans son espace Personnel : c’est son historique.
- Une copie locale reste rattachée au compte qui l’a obtenue. Les informations et copies chiffrées déjà obtenues peuvent rester lisibles chez l’ancien membre qui possède encore la clé. La révocation porte sur ses accès au serveur.

### 6.4 Confidentialité

La page Confidentialité explique que Capiste héberge les données chiffrées et traite les métadonnées d’adhésion et d’écriture. Elle indique aussi :

- « Capiste gère les clés et peut déchiffrer les données de ton Foyer pour les restituer à ses membres. Une personne qui peut se connecter à ton compte, par exemple avec ton mot de passe ou via ta boîte e-mail, peut aussi ouvrir ton Foyer. »
- « Si tu supprimes ton compte, ton adhésion disparaît. Les entrées communes restent accessibles à l’autre membre et ton nom est retiré de leur attribution. Si tu es le dernier membre, le Foyer et ses entrées sont supprimés côté serveur. »
- Les conditions d’utilisation du lien d’invitation (§6.2) et le sort des informations déjà consultées ou enregistrées après le départ (§2.3 et §6.3).

---

## 7. Interface

- **Sélecteur d’espace** dans `TopHeader` : « Personnel » / « Notre foyer » (prénom du foyer si défini). Mémorisé par appareil.
- **`/foyer`** (Plus → Foyer) : créer un foyer, inviter, membres, mon versement, option compte commun, quitter, arrêter le partage, copie en lecture seule.
- **`/foyer/rejoindre`** : accepter une invitation.
- **Aujourd’hui (Foyer)** : « Disponible confirmé », « Avec les versements attendus », prochains mouvements (versements « Réception à confirmer », échéances), point d’attention F3, enveloppes. Exemple de maquette validé dans la relecture du 21 novembre.
- **Saisie rapide (Foyer)** : case « Payé avec mon argent personnel » (M3).
- **`/foyer/mouvements`** : versements du mois par personne, transferts (déclarer, confirmer, « Pas reçu »), récapitulatif des avances avec la phrase de neutralité. Non affiché sur l’accueil.
- **Chaque élément** du foyer affiche « Ajouté par <prénom> » dans son détail. Le détail indique aussi qui l’a modifié lorsque c’est pertinent. Quand le compte de l’auteur a été supprimé, utiliser « Ancien membre » pour l’attribution et pour ses mouvements conservés.
- Tous les textes depuis `lib/household-copy.ts`.

---

## 8. Découpage en PR

| PR | Chantier | Condition de validation (démontrée par test) |
|---|---|---|
| 1 | Fondations : migration, RLS, fonctions, chiffrement des éléments, route de clé gérée, jeton d’invitation et suppression de compte | Un compte non membre ou retiré ne reçoit ni élément ni clé ; les fonctions du Foyer n’accèdent jamais à `budget_vaults` ; l’invitation est à usage unique, expire et refuse un 3ᵉ membre ; un élément déplacé d’identifiant ne se déchiffre pas ; la suppression de compte préserve les entrées du membre restant et le départ du dernier membre supprime le foyer |
| 2 | Budget commun et synchronisation : éléments, `diffHousehold`, `materializeHousehold`, solde par points de départ et effets, file hors ligne, sélecteur d’espace, foyer à un membre sur plusieurs appareils | Aucune dépense perdue lors de modifications simultanées ; solde commun exact quel que soit l’ordre d’arrivée ; renvoi idempotent |
| 3 | Versements (M2) et lignes miroir, alerte F3, affichage confirmé / attendu | Aucun double comptage ; versements attendus distingués des reçus ; textes conformes à la charte |
| 4 | Avances (M3), transferts (M4), confirmation, récapitulatif (M5), option sans compte commun | Soldes, analyses et contributions nettes exacts (scénario F-B) ; une entrée personnelle n’apparaît qu’après confirmation |
| 5 | Invitations (écrans), départ, arrêt du partage, copie en lecture seule, page Confidentialité | Récupération sur un nouvel appareil, accès en ligne révoqués après le départ, copie locale figée, données du membre restant préservées, aucun texte interdit |

La durée n’est pas figée avant l’audit de ce plan. La PR 1 et la PR 5 incluent une vérification sur une base Supabase de test, locale ou hébergée, avec les comptes jetables nécessaires aux scénarios F-E.

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
- A écrit une modification et perd la réponse, puis B modifie la même entrée. Au renvoi de A, le serveur renvoie le `seq` d’origine et conserve la modification de B.
- Depuis 500 €, A recopie 450 € et y ajoute une dépense de 20 €. B recopie 400 € avec le même numéro de révision local. Si le relevé de B est validé en dernier, supprimer la dépense rattachée au relevé de A laisse le solde à **400 €**. Chaque ordre de validation doit produire le même solde sur les deux appareils.
- L’UUID de synchronisation d’un profil `member` correspond à celui recalculé par le déclencheur de suppression de compte.
- Depuis un relevé de 500 €, deux appareils marquent la même échéance de 100 € comme payée. Le solde est de **400 €** dans les deux ordres de réception. Deux échéances distinctes de 100 € donnent **300 €**.
- Quand paiement et annulation de la même échéance arrivent dans l’ordre inverse, le plus grand `seq` l’emporte. Un paiement retenu donne **400 €**, une annulation retenue **500 €**.
- Une échéance rattachée à l’ancien relevé cesse de débiter le solde après la validation d’un nouveau relevé.
Propriété : pour chaque action du réducteur couverte par les tests P0–P3, `materialize(records ∪ diff) ≡ reduce`.

**F-E. Sécurité et accès (PR 1 et 5).**
Sur une base de test :

- Un non-membre ne peut lire ni les éléments, ni les membres, ni les invitations et ne peut obtenir la clé. Les membres actifs d’un même foyer obtiennent la même clé sur leurs appareils. Les clés de deux foyers distincts diffèrent. Même si l’identifiant de foyer est égal à un identifiant de compte, la clé du foyer diffère de celle du budget personnel. Un élément déplacé vers un autre foyer ou identifiant échoue au déchiffrement.
- Une invitation expirée, annulée, déjà utilisée ou pour un 3ᵉ membre est refusée. Deux tentatives d’acceptation en parallèle ne peuvent utiliser deux fois la même invitation ni dépasser la limite de membres.
- Après `stop_sharing_with` ou un départ volontaire, l’ancien membre ne peut plus obtenir la clé, envoyer des modifications ni lire les éléments en ligne, même avec le jeton de session qu’il utilisait avant son retrait et un `after_seq` de 0. L’autre membre peut toujours ouvrir les éléments existants. L’ancien membre peut consulter sa copie locale figée.
- A et B partagent un foyer. A crée une entrée, puis A modifie une entrée créée par B. A supprime son compte. B retrouve les deux entrées. La première a `created_by` à `null`, la seconde garde B comme auteur et a `updated_by` à `null`. L’adhésion et le profil de A sont supprimés. L’interface affiche « Ancien membre » quand elle attribue une écriture de A. Quand B quitte le foyer ou supprime son compte, le foyer, ses entrées et ses invitations disparaissent côté serveur.
- `budget_vaults` reste inaccessible entre membres.

**F-F. Charte (§2.4).** Tous les textes de `household-copy.ts` et ceux générés pour F-A à F-D passent le filtre des motifs interdits ; les textes §2.2 et §2.3 sont exacts.

---

## 10. Prérequis et décisions hors code

1. **Envoi des e-mails** : configurer Resend comme SMTP de Supabase avec les modèles français (`{{ .Token }}`) avant toute invitation réelle.
2. **Supabase Pro** (sauvegardes quotidiennes, pas de mise en pause) et **accord de traitement des données** signé avant d’ouvrir le foyer à de vrais couples.
3. **Vercel Pro** pour un usage commercial, à vérifier côté équipe Start’OnLab.
4. **Offre** : Foyer gratuit pendant le pilote ; prix test envisagé 2,99 €/mois TTC par foyer ou 29 €/an, à valider auprès des testeurs. Pas de paiement en V1.
5. **Page Confidentialité** : gestion des clés et risque d’accès au compte, conservation des entrées partagées après suppression du compte, invitation et copie d’un ancien membre (§6.4).
