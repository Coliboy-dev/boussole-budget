# P3 — Dépenses du quotidien, enveloppes et « Où part mon argent »

Plan d’implémentation complet. Il est écrit pour être exécuté par un agent de code (ChatGPT/Codex) **sans interprétation** : chaque décision est déjà prise. En cas de doute non couvert ici, **s’arrêter et demander** plutôt que deviner.

État de référence : `main` au commit `6fc2c6d` (20 novembre 2026), 69 tests verts.

---

## 0. Consignes pour l’agent (à lire avant tout)

1. Lis `AGENTS.md` : cette version de Next.js (16.4.6) diffère de tes connaissances. Avant d’écrire un composant ou une route, consulte le guide concerné dans `node_modules/next/dist/docs/`.
2. Travaille **une PR à la fois** (PR 1, puis PR 2, puis PR 3). Ne commence pas la suivante avant que la précédente soit fusionnée. Branche par PR, nommée `p3-1-modele-depenses`, `p3-2-saisie-enveloppes`, `p3-3-analyse`.
3. **Ne modifie aucun attendu de test existant.** Les 69 tests actuels doivent rester verts sans changement. Si un test existant échoue, c’est ton code qui est faux.
4. Aucune nouvelle dépendance npm. Aucun appel réseau nouveau. Aucune IA. Tout reste dans le navigateur.
5. Argent : toujours en **centimes entiers** pour les calculs (`toCents` / `fromCents` de `lib/money.ts`). Jamais d’addition de nombres flottants en euros.
6. Dates : chaînes `YYYY-MM-DD`, fuseau Europe/Brussels, uniquement via `lib/local-date.ts` (`addDays`, `addMonths`, `daysBetween`, `isLocalDate`, `todayInBrussels`). Jamais `new Date()` pour calculer une date métier.
7. Interface en **français, tutoiement**, phrases courtes. Montants affichés avec `formatCurrency`, dates avec `formatShortDate` / `formatDate`.
8. Réutilise les composants existants : `Modal`, `FormField`, `useFormValidation`, `CompactRows`, `DetailSheet`, `DetailFact`, `Badge`, `Card`, `Icon` (+ `lucide-react`), `PaymentUndoToast`. Pas de `window.confirm` : confirmation en ligne comme dans `DetailSheet`.
9. Accessibilité : cibles d’au moins 44 px, chaque champ a un libellé, aucune information portée par la couleur seule, 0 violation axe-core WCAG 2.2 AA.
10. Avant chaque commit : `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`. Si `tsc` signale des types `.next` périmés : `rm -rf .next`.
11. Mets à jour `docs/audit/README.md` (une section par PR, style factuel existant).

---

## 1. Objectif produit

Boussole sait déjà ce que tu **vas** payer (échéances) et ce que tu peux dépenser (vrai disponible). Elle doit aussi montrer ce que tu **as** dépensé au quotidien, par catégorie et par mois, pour décider quoi réduire le mois suivant, et traduire cette décision en marge sur le vrai disponible.

Trois briques :

1. **Saisie rapide d’une dépense** en moins de 5 secondes, dictée possible via le micro du clavier du téléphone.
2. **Enveloppes mensuelles** par catégorie (ex. Courses 400 €/mois), reliées au vrai disponible.
3. **« Où part mon argent »** : total du mois par catégorie, comparaison, ligne « Non encodé » qui garde l’analyse honnête, et simulation « Et si » sur les enveloppes.

Hors périmètre : import de relevés, lecture de tickets, IA, enveloppes hebdomadaires, budgets partagés.

---

## 2. Règles métier (décisions arrêtées)

### R1 — Une dépense débite le solde suivi
Ajouter une dépense diminue `currentBalance` de son montant, **sauf** si elle est marquée « déjà comprise dans mon solde » (`balanceIncluded: true`). Une dépense **ne modifie jamais `balanceDate`** (cette date signifie « dernier solde recopié depuis la banque » et alimente le rappel de solde ancien).

### R2 — Case « Déjà comprise dans mon solde »
Affichée seulement si `balanceDate` existe et que la date de la dépense est `<= balanceDate`. Valeur par défaut : cochée si `date < balanceDate`, décochée si `date === balanceDate`. Masquée et `false` sinon.

### R3 — Enveloppe dans le vrai disponible
Une enveloppe = un montant mensuel pour une catégorie de dépense (au plus **une enveloppe par catégorie**). Dans la projection sur 35 jours :
- **mois en cours** : on réserve `max(0, montant − dépensé ce mois-ci dans la catégorie)` **le jour même** (`today`) ;
- **chaque 1er du mois suivant** compris dans l’horizon : on réserve le montant complet ce jour-là.

Ces réservations sont prudentes (`isEstimated: false`). Conséquences voulues :
- dépenser **dans** l’enveloppe ne change pas le vrai disponible (le solde baisse, la réserve baisse d’autant) ;
- dépasser l’enveloppe fait baisser le vrai disponible du dépassement ;
- une dépense dans une catégorie **sans** enveloppe fait baisser le vrai disponible de son montant ;
- changer le montant d’une enveloppe s’applique aussi au reste du mois en cours.

### R4 — Pas de double comptage avec les charges
Une charge existante (ex. « Courses 300 €/mois » saisie comme charge) et une enveloppe de même catégorie seraient comptées deux fois. L’interface le signale et propose de **remplacer la charge par l’enveloppe** (suppression de la charge après confirmation, création de l’enveloppe avec son équivalent mensuel `toMonthlyAmount`). Aucune migration automatique des données.

### R5 — Écart de solde (« Non encodé »)
Quand la personne recopie le solde de sa banque (`updateBalance`, déjà en place) **et** qu’un solde précédent existait :
`attendu = soldeSuivi + Σ(montants signés des échéances cochées « déjà passées »)`
`écart = attendu − nouveauSolde`.
Si `écart ≠ 0`, on enregistre un `BalanceGap { fromDate: ancienne balanceDate, date: today, amount: écart }`. Un écart positif = sorties non encodées ; négatif = entrées non encodées. Deux mises à jour le **même jour** fusionnent (somme des montants, même `fromDate` que le premier) ; si la somme vaut 0, l’écart est supprimé.
Le montant « Non encodé » affiché pour un écart = `max(0, gap.amount − Σ montants des dépenses balanceIncluded=true dont fromDate < date <= gap.date)`. Calcul **dynamique**, jamais stocké.

### R6 — Modifier ou supprimer une dépense
Le budget porte un compteur `balanceRevision` (entier, 0 par défaut) incrémenté à chaque `updateBalance`. Chaque dépense mémorise `balanceRevision` à sa création et `debited` (= `!balanceIncluded`).
- Suppression : si `debited && spending.balanceRevision === state.balanceRevision`, on recrédite le montant ; sinon le solde ne bouge pas (il a été remplacé par celui de la banque depuis).
- Modification du montant : même règle, appliquée à la différence (ancien − nouveau).
- Modification de la catégorie, du libellé ou de la date : aucun effet sur le solde.

### R7 — Catégories
```
SpendingCategory = 'groceries' | 'restaurants' | 'transport' | 'health' | 'leisure'
                 | 'clothing' | 'home' | 'children' | 'cash' | 'other'
```
Libellés : Courses, Restaurants et snacks, Transport et carburant, Santé et pharmacie, Loisirs et sorties, Vêtements, Maison et bricolage, Enfants (quotidien), Retrait d’espèces, Autre.
L’analyse « Où part mon argent » regroupe : les catégories de dépenses ci-dessus, les catégories des charges existantes (`ExpenseCategory`, libellés de `components/budget/ExpenseList.tsx`), `debts` (« Dettes ») et `unrecorded` (« Non encodé »). Les clés communes (`groceries`, `transport`, `health`, `other`) fusionnent.

### R8 — Reconnaissance du commerce, sans IA
- Clé de commerce : minuscules, accents retirés (`normalize('NFD')`), chiffres et ponctuation retirés, espaces réduits ; on garde le **premier mot** s’il fait au moins 3 lettres, sinon les deux premiers. Ex. « COLRUYT MARBAIS MAR… » → `colruyt` ; « CRF EXP SCHAERBEEK » → `crf exp` ; « Cadi Marbais » → `cadi`.
- Ordre de décision : 1) mémoire apprise de la personne (`merchantCategories`), 2) dictionnaire intégré, 3) aucune catégorie proposée.
- Chaque enregistrement d’une dépense avec un libellé met à jour `merchantCategories[clé] = catégorie choisie` (la correction de la personne gagne toujours).

### R9 — Saisie rapide dictée
Un champ texte « Saisie rapide » (le micro du clavier du téléphone dicte dedans). Son texte est analysé à chaque frappe et **pré-remplit** montant, libellé et catégorie, qui restent modifiables. Rien n’est enregistré sans appui sur « Ajouter la dépense ».

---

## 3. PR 1 — Modèle, moteur et logique pure (aucune interface)

### 3.1 Types — `lib/types.ts`
Ajouter :
```ts
export type SpendingCategory = 'groceries' | 'restaurants' | 'transport' | 'health' | 'leisure'
  | 'clothing' | 'home' | 'children' | 'cash' | 'other';

export interface Envelope {
  id: string;
  category: SpendingCategory;
  label: string;          // par défaut le libellé de la catégorie
  monthlyAmount: number;  // euros, >= 0
}

export interface Spending {
  id: string;
  date: string;           // YYYY-MM-DD, <= aujourd’hui à la saisie
  amount: number;         // euros, > 0
  category: SpendingCategory;
  label?: string;
  balanceIncluded: boolean;
  debited: boolean;       // le solde suivi a été débité à la création
  balanceRevision: number;
}

export interface BalanceGap {
  id: string;
  fromDate: string;       // balanceDate précédente
  date: string;           // jour de la mise à jour
  amount: number;         // euros, signé
}
```

### 3.2 État — `lib/budget-state.ts`
- `AppState` reçoit : `envelopes: Envelope[]`, `spendings: Spending[]`, `balanceGaps: BalanceGap[]`, `merchantCategories: Record<string, SpendingCategory>`, `balanceRevision: number`.
- `emptyBudgetState` : `[]`, `[]`, `[]`, `{}`, `0`.
- `convertAmounts` convertit `envelopes[].monthlyAmount`, `spendings[].amount`, `balanceGaps[].amount` (ce dernier peut être négatif).
- `BUDGET_VERSION = 3`. `serializeBudget` écrit la version 3.
- `deserializeStoredBudget` accepte **2 et 3**. Pour une version 2, compléter l’état avec les valeurs par défaut ci-dessus **avant** `assertBudgetState`. Toute autre version : même message d’erreur qu’aujourd’hui.
- `migrateLegacyBudget` (v1) : complète aussi avec ces valeurs par défaut (déjà le cas via `{ ...defaults, ...value }`, vérifier).

### 3.3 Validation — `lib/budget-schema.ts`
- Ajouter un contrôle `record(check)` pour un objet à clés libres (clé non vide, valeur contrôlée).
- `envelopes: entities({ category: spendingCategory, label: text, monthlyAmount: money })` + contrôle « au plus une enveloppe par catégorie » (message : « Catégories en double dans « budget.envelopes ». »).
- `spendings: entities({ date, amount: money strictement > 0, category: spendingCategory, label: optional(text), balanceIncluded: flag, debited: flag, balanceRevision: nonNegativeInteger })`.
- `balanceGaps: entities({ fromDate: date, date, amount: amount(unit, true) })`.
- `merchantCategories: record(spendingCategory)`, `balanceRevision: nonNegativeInteger`.

### 3.4 Moteur — `lib/occurrences.ts` et `lib/projection.ts`
- `Occurrence['type']` devient `'income' | 'expense' | 'debt' | 'child' | 'envelope'`.
- Nouvelle fonction pure dans `lib/envelopes.ts` :
  ```ts
  export function spentInMonth(spendings: Spending[], category: SpendingCategory, month: string /* YYYY-MM */): number // centimes
  export function envelopeOccurrences(envelopes: Envelope[], spendings: Spending[], today: string, end: string): Occurrence[]
  ```
  `envelopeOccurrences` applique R3. Libellés : « Enveloppe Courses (reste de décembre) » pour le mois en cours, « Enveloppe Courses (janvier) » pour un mois suivant. `sourceId` = id de l’enveloppe, `status: 'planned'`, `isEstimated: false`, montant négatif. Une enveloppe à 0 € ou un reste à 0 ne produit pas d’occurrence.
- `buildProjection` : nouvelle option `{ envelopes = [], spendings = [] }` dans l’objet d’options (paramètre existant). Les occurrences d’enveloppes rejoignent la liste triée **à l’intérieur** de `buildProjection` uniquement. **Ne pas** les ajouter à `forecastOccurrences` (les rappels, l’échéancier payable et `passedOccurrences` doivent les ignorer).
- `components/projection/ProjectionEventList.tsx` : `eventLabels` reçoit `envelope: 'Enveloppe'` ; aucun bouton « Payé » pour ce type (la condition `payable` actuelle le garantit, vérifier).

### 3.5 Résumé — `lib/budget-calculations.ts`
- `calculateBudgetSummary` reçoit un **9ᵉ paramètre optionnel** `{ envelopes = [], spendings = [] } = {}` transmis à `buildProjection`. Les appels existants restent valides tels quels.
- `BudgetSummary.totalMonthlyEnvelopes` (euros) = somme des `monthlyAmount`.
- La marge mensuelle de `savingsCapacity` retire aussi `totalMonthlyEnvelopes`.
- `emptyBudget` reste faux dès qu’il existe une enveloppe ou une dépense.
- `lib/context/AppContext.tsx` passe `{ envelopes: state.envelopes, spendings: state.spendings }` à `calculateBudgetSummary`. La page `/simulation` (`lib/purchase-simulation.ts`) part de `summary.availableForecast` : elle intègre donc les enveloppes sans modification ; ajouter un test qui le vérifie.

### 3.6 Dépenses — `lib/spending.ts` (fonctions pures sur `AppState`)
```ts
addSpending(state, input: { id, date, amount, category, label?, balanceIncluded }, today): AppState
updateSpending(state, id, changes: Partial<{ date, amount, category, label }>): AppState
deleteSpending(state, id): AppState
upsertEnvelope(state, envelope: Envelope): AppState          // remplace l’enveloppe de même catégorie
deleteEnvelope(state, id): AppState
replaceExpenseWithEnvelope(state, expenseId, category: SpendingCategory): AppState // R4
```
Règles R1, R2 (la valeur reçue est appliquée telle quelle ; le défaut est calculé par l’interface), R6, R8 (mise à jour de `merchantCategories` dans `addSpending` et `updateSpending` si libellé présent). Refuser silencieusement (retourner `state` inchangé) : montant ≤ 0 ou non exact au centime, date invalide ou future, id inconnu.

### 3.7 Mise à jour du solde — `lib/balance-update.ts`
Étendre `updateBalance` (sans changer sa signature publique) : calcul de l’écart R5 **avant** de remplacer le solde, fusion du même jour, incrément de `balanceRevision`. L’identifiant d’un écart : `gap-${today}`. Les 5 tests de `tests/balance-update.test.mjs` restent verts (écart 0 dans ces scénarios ⇒ aucun `BalanceGap`).

### 3.8 Analyse — `lib/spending-analysis.ts`
```ts
export type AnalysisCategory = SpendingCategory | ExpenseCategory | 'debts' | 'unrecorded';
export interface MonthAnalysis {
  month: string;                         // YYYY-MM
  totalCents: number;
  rows: { category: AnalysisCategory; cents: number; previousCents: number; averageCents: number | null }[]; // triées par cents décroissants
  unrecordedCents: number;
  recordedCount: number;                 // nombre de dépenses encodées dans le mois
}
export function analyzeMonth(state: AppState, month: string): MonthAnalysis
export function monthItems(state: AppState, month: string, category: AnalysisCategory): { date: string; label: string; cents: number; source: 'spending' | 'expense' | 'debt' | 'gap'; id: string }[]
```
Sources pour un mois :
- dépenses (`spendings`) datées du mois ;
- échéances de charges **payées** dont la date d’échéance est dans le mois (`occurrenceStatuses[date] === 'paid'`, plus l’ancien `isPaid` avec `dueDate` dans le mois), montant = `expense.amount` actuel (approximation assumée, à écrire dans le README) ;
- mensualités de dettes payées dans le mois → `debts`, montant = `debt.monthlyPayment` ;
- écarts positifs datés du mois → `unrecorded` selon R5.

`previousCents` = même catégorie au mois précédent. `averageCents` = moyenne des 3 mois précédents **qui contiennent au moins une donnée** ; `null` s’il n’y en a aucun. Les revenus ne figurent pas dans l’analyse.

### 3.9 Saisie rapide — `lib/quick-entry.ts` et `lib/merchants.ts`
```ts
parseQuickEntry(text: string): { amount?: number; label?: string }
merchantKey(label: string): string
suggestCategory(label: string, learned: Record<string, SpendingCategory>): SpendingCategory | undefined
```
`parseQuickEntry` : premier montant trouvé, formats acceptés `42,28` `42.28` `42 €` `42€28` `42 euros 28` `42 euros` `€42,28` ; le reste du texte devient le libellé après retrait de : « j’ai dépensé », « j'ai payé », « euros », « euro », « eur », « € », « chez », « au », « à la », « à », « pour », et des espaces en trop. Pas de nombres écrits en lettres (hors périmètre).
Dictionnaire (`lib/merchants.ts`, clé → catégorie) — base de départ, extensible :
- groceries : colruyt, delhaize, aldi, lidl, carrefour, crf exp, intermarche, okay, spar, cora, match, proxy, albert, ecomarche, cadi, bio planet, louis delhaize
- restaurants : quick, mcdonalds, mcdonald, burger, exki, panos, pizza, friterie, starbucks
- transport : stib, tec, sncb, nmbs, lijn, total, totalenergies, q8, esso, shell, lukoil, texaco, gulf, cambio, poppy
- health : pharmacie, multipharma, apotheek
- clothing : primark, zara, kiabi, c&a, hm, jbc, zeeman
- home : ikea, brico, hubo, gamma, action, hema, blokker, leroy
- leisure : kinepolis, decathlon, fnac, netflix, spotify
- cash : retrait, bancontact retrait, atm

### 3.10 Tests de la PR 1 — `tests/spending.test.mjs` (attendus exacts)
En tête : `process.env.TZ = 'Europe/Brussels'`. Scénario de base : `today = '2026-12-10'`, horizon 35 jours (fin `2027-01-14`), solde 1 000 €, `balanceDate = '2026-12-01'`, réserve 50 €, aucun revenu ni charge, enveloppe Courses 400 €/mois, dépenses Courses de décembre totalisant 150 € (déjà comprises).
1. **Enveloppe de base** : point bas 350 € (1 000 − 250 aujourd’hui − 400 le 1ᵉʳ janvier), vrai disponible **300 €**.
2. **Dépense dans l’enveloppe** : `addSpending` 50 € Courses, non comprise → solde 950 €, vrai disponible **300 €** (inchangé), `balanceDate` inchangée.
3. **Dépassement** : depuis 2, +300 € Courses → solde 650 €, reste 0, vrai disponible **200 €**.
4. **Catégorie sans enveloppe** : depuis 1, +30 € Restaurants non comprise → vrai disponible **270 €**.
5. **Et si** : depuis 1, enveloppe ramenée à 300 € → vrai disponible **500 €** (+100 sur décembre, +100 sur janvier).
6. **Écart de solde** : depuis 2 (solde suivi 950 €), `updateBalance(900)` le 10/12 → un `BalanceGap { fromDate: '2026-12-01', date: '2026-12-10', amount: 50 }`, `balanceRevision` 1 ; `analyzeMonth(…, '2026-12').unrecordedCents` = **5 000**. Puis `addSpending` 20 € datée du 08/12, comprise → non encodé **3 000**, solde inchangé 900 €.
7. **Correction le même jour** : depuis la première partie de 6, `updateBalance(880)` le même jour → un seul écart de **70 €**.
8. **Suppression** : dépense créée avant une mise à jour de solde puis supprimée → solde inchangé ; dépense créée après → solde recrédité.
9. **Pas de régression** : les échéances cochées dans `updateBalance` dont la somme explique tout l’écart ne créent aucun `BalanceGap` (reprendre le budget de `tests/balance-update.test.mjs`).
10. **Charges dans l’analyse** : loyer 650 € payé le 01/12 + dépense Courses 42,28 € → rows `rent` 65 000 et `groceries` 4 228, total 69 228.
11. **Comparaison** : novembre Courses 300 €, décembre 200 € → `previousCents` 30 000 ; `averageCents` sur les mois disponibles uniquement.
12. **Remplacement charge → enveloppe** : charge Courses 300 €/mois → après `replaceExpenseWithEnvelope`, plus de charge Courses, enveloppe 300 €, et le vrai disponible ne compte plus les 300 € deux fois.
13. **Sérialisation** : aller-retour v3 identique ; un fichier v2 existant se charge avec les valeurs par défaut ; une version 4 est refusée ; une enveloppe en double sur une catégorie est refusée.
14. **Saisie rapide** (tableau) : « 42,28 Colruyt » → 42.28 / « Colruyt » ; « j'ai dépensé 12 euros au primeur » → 12 / « primeur » ; « 42 euros 28 Delhaize » → 42.28 ; « €7,5 pharmacie » → 7.5 ; « Colruyt » → montant absent ; « 0 » → montant absent.
15. **Commerce** : `merchantKey('COLRUYT MARBAIS MAR')` = `colruyt` ; `suggestCategory('CRF EXP SCHAERBEEK', {})` = `groceries` ; une catégorie apprise pour `cadi` l’emporte sur le dictionnaire.

### 3.11 Critères d’acceptation PR 1
Tous les tests verts (69 existants + nouveaux), `tsc`, `lint`, `build` OK, **aucun changement visible** dans l’application (les écrans existants affichent les mêmes chiffres). Section README « Dépenses et enveloppes : modèle et calcul ».

---

## 4. PR 2 — Saisie rapide, enveloppes et liens

### 4.1 Contexte — `lib/context/AppContext.tsx`
Actions réducteur : `ADD_SPENDING`, `UPDATE_SPENDING`, `DELETE_SPENDING`, `UPSERT_ENVELOPE`, `DELETE_ENVELOPE`, `REPLACE_EXPENSE_WITH_ENVELOPE`, toutes déléguées aux fonctions pures de `lib/spending.ts` (même modèle que `RECORD_PAYMENT`). Méthodes exposées : `addSpending`, `updateSpending`, `deleteSpending`, `saveEnvelope`, `deleteEnvelope`, `replaceExpenseWithEnvelope`. Identifiants : `crypto.randomUUID()`.
Annulation après ajout : `undoLastSpending()` qui supprime la dernière dépense ajoutée (via `deleteSpending`, donc avec recrédit selon R6), disponible tant qu’aucune autre modification n’a eu lieu (même garde que `undoScheduledPayment`).

### 4.2 Saisie — `components/spending/QuickSpendingSheet.tsx`
Ouvre une `Modal` titrée « Nouvelle dépense ». Ordre des champs :
1. **Saisie rapide** (texte, `autoComplete="off"`, indication : « Écris ou dicte : 42,28 Colruyt »). À chaque changement : `parseQuickEntry` puis pré-remplissage des champs suivants **seulement s’ils n’ont pas été modifiés à la main**.
2. **Montant** (`type="number"`, `inputMode="decimal"`, `step="0.01"`, `min="0.01"`, requis, focus initial ici si la saisie rapide est vide).
3. **Catégorie** : groupe de boutons radio (`role="radiogroup"`) avec icône et libellé ; les 6 catégories les plus utilisées sur 60 jours d’abord, puis « Autres catégories » qui déplie le reste. Présélection : `suggestCategory`.
4. **Commerce ou note** (facultatif).
5. **Date** (défaut aujourd’hui, `max` = aujourd’hui).
6. Case **« Déjà comprise dans mon solde »** selon R2, avec l’aide « Coche si ton solde a été recopié de ta banque après cet achat. »
Bouton « Ajouter la dépense ». Erreurs sous les champs via `useFormValidation`. Après ajout : fermeture, puis `PaymentUndoToast` adapté (« Dépense ajoutée : Colruyt, 42,28 € — Annuler »).

### 4.3 Points d’entrée
- `app/dashboard/page.tsx` : bouton principal « Ajouter une dépense » juste sous la carte du vrai disponible, à côté de « Simuler un achat ».
- Page `/depenses` (en-tête).

### 4.4 Page `/depenses` — `app/depenses/page.tsx` « Dépenses du mois »
- Sélecteur de mois (← mois →, pas au-delà du mois courant), libellé « décembre 2026 ».
- **Enveloppes** : une ligne par enveloppe (`CompactRows`) : icône, libellé, « 150 € sur 400 € », note « 250 € restants » ou « Dépassée de 30 € » (badge danger + texte), barre de progression en pied de ligne. Appui → `DetailSheet` (modifier le montant, supprimer). Bouton « Créer une enveloppe ».
- **Formulaire d’enveloppe** (`Modal`) : catégorie (seules celles sans enveloppe), libellé (prérempli), montant mensuel. Si une charge de même catégorie existe (correspondance : `groceries`↔`groceries`, `transport`↔`transport`, `health`↔`health`, `other`↔`other`) avec une fréquence autre que `one_time`, afficher l’avertissement R4 avec le bouton « Remplacer la charge par cette enveloppe » (confirmation en ligne, puis `replaceExpenseWithEnvelope`).
- **Dépenses du mois** : liste `CompactRows` regroupée par jour (en-tête « mar. 8 déc. »), montant, catégorie, libellé ; appui → `DetailSheet` avec modification (même formulaire que la saisie) et suppression confirmée. État vide : « Aucune dépense encodée ce mois-ci. » + bouton d’ajout.
- Lien « Voir où part mon argent » vers `/analyse`.

### 4.5 Budget, navigation, hors ligne
- `app/budget/page.tsx` : nouvelle ligne de section « Dépenses du mois » (détail : « 342 € dépensés · 258 € restants dans les enveloppes ») vers `/depenses`, et « Où part mon argent » vers `/analyse` (PR 3 : lien affiché seulement quand la page existe). La carte « Répartition du mois » gagne un segment **Enveloppes** (`summary.totalMonthlyEnvelopes`) entre Dettes et Reste, couleur distincte, avec libellé et pourcentage.
- `components/layout/BottomNav.tsx` : ajouter `/depenses` (et `/analyse` en PR 3) aux routes de l’onglet Budget.
- `public/service-worker.js` : ajouter `/depenses` (et `/analyse` en PR 3) à la liste `pages`.

### 4.6 Critères d’acceptation PR 2
- Ajouter une dépense depuis Aujourd’hui en 3 gestes (montant, catégorie, valider). Le vrai disponible ne bouge pas si la dépense reste dans l’enveloppe.
- La dictée « 42,28 Colruyt » via le micro du clavier remplit montant, libellé et Courses.
- Une catégorie corrigée pour « Cadi » est proposée d’office la fois suivante.
- Remplacer « Courses 300 €/mois » par une enveloppe ne change pas le vrai disponible quand rien n’a été dépensé ce mois-ci.
- Tests navigateur (Playwright, 390 × 844) : ajout, annulation, modification, suppression, enveloppe dépassée, remplacement d’une charge, axe-core 0 violation sur `/depenses`, la feuille de saisie et le formulaire d’enveloppe.

---

## 5. PR 3 — « Où part mon argent »

### 5.1 Page `/analyse` — `app/analyse/page.tsx`
- Titre « Où part mon argent », sélecteur de mois, total du mois.
- Une ligne par catégorie (`analyzeMonth`) : icône, libellé, montant, part du total en %, barre proportionnelle, et comparaison **en texte** : « +12,40 € par rapport à novembre » / « −30 € » / « Pas de comparaison » (jamais par la couleur seule).
- Ligne **« Non encodé »** en gris si > 0, avec explication en détail : « Différence entre ton solde recopié de la banque et ce que tu as encodé. Encode tes dépenses pour réduire cette ligne. »
- Bandeau d’honnêteté si `unrecordedCents` dépasse 20 % du total : « Une partie de tes dépenses n’est pas encodée : l’analyse est incomplète. »
- Appui sur une catégorie → `DetailSheet` listant `monthItems` (date, libellé, montant).

### 5.2 « Et si » sur une enveloppe
Dans le détail d’une catégorie qui a une enveloppe : champ « Nouveau montant mensuel » et aperçu calculé en direct avec `calculateBudgetSummary` sur une copie de l’état : « Ton vrai disponible passerait de 98,00 € à 148,00 € ». Bouton « Appliquer » → `saveEnvelope`. Si la catégorie n’a pas d’enveloppe : « Tu y as dépensé en moyenne 63 € par mois. » + bouton « Créer une enveloppe » prérempli avec cette moyenne arrondie aux 5 € supérieurs.

### 5.3 Critères d’acceptation PR 3
- Les montants de l’analyse correspondent aux tests 10 et 11.
- Un écart de solde apparaît en « Non encodé » et diminue quand on encode la dépense oubliée (« comprise dans mon solde »).
- « Et si » affiche exactement la différence calculée par le moteur (test 5).
- axe-core 0 violation sur `/analyse` et ses détails.

---

## 6. Pièges connus du dépôt

- `ProjectionEvent.type` alimente des `Record` indexés par type (`eventLabels`) : ajouter l’entrée `envelope` partout où TypeScript le signale.
- `getUpcomingReminders`, `passedOccurrences` et l’échéancier payable reposent sur `forecastOccurrences` : les enveloppes ne doivent **pas** y entrer.
- `recordPayment` met `balanceDate` à jour quand il débite ; **les dépenses ne doivent pas** le faire (R1).
- Les paiements passent par `ensureSavedForPayment` ; les dépenses passent par le réducteur et l’enregistrement normal, comme les autres saisies.
- Playwright ne peut pas taper de texte dans un `input type="number"` : utiliser des valeurs numériques.
- La politique CSP impose un nonce : pas de script inline ajouté à la main.
- La synchronisation chiffrée transporte tout l’état : rien à changer, mais tester un aller-retour v3 dans `tests/cloud-sync.test.mjs` n’est pas nécessaire (la sérialisation est déjà testée en PR 1).
- Ne pas toucher à la démo (`/demo`) : elle doit continuer d’afficher les mêmes chiffres.

## 7. Ce qui reste à décider plus tard (ne pas implémenter)
Enveloppes hebdomadaires, report du reste d’une enveloppe d’un mois sur l’autre, catégories personnalisées, export CSV des dépenses, alignement sur la grille de l’Observatoire du Crédit et de l’Endettement.
