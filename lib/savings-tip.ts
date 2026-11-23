import type { AppState } from './budget-state.ts';
import { labelKey } from './label-breakdown.ts';
import { addDays } from './local-date.ts';
import { fromCents, toCents } from './money.ts';
import { spendingCategoryLabels, spendingsOf } from './spending.ts';
import type { SpendingCategory } from './types.ts';

/**
 * Catégories où une habitude se réduit facilement. Les courses, la santé, le transport, les enfants ou la maison
 * n'y sont pas : on ne suggère pas de rogner sur l'essentiel.
 */
const DISCRETIONARY: ReadonlySet<SpendingCategory> = new Set(['restaurants', 'leisure', 'other', 'beauty', 'gifts']);
/** Une habitude, pas un achat isolé : au moins 3 fois sur la période. */
const MIN_COUNT = 3;
const MIN_TOTAL_CENTS = 1000;
export const TIP_DAYS = 30;

export interface SavingsTip {
  label: string;
  category: SpendingCategory;
  count: number;
  /** Total des 30 derniers jours, en euros. */
  total: number;
  /** Ordre de grandeur sur un an à ce rythme (× 12), en euros. */
  yearly: number;
  /** Ce que garderait une réduction de moitié, par mois, en euros. */
  halfPerMonth: number;
}

/**
 * Une seule piste, la plus utile : la dépense répétée la plus coûteuse des 30 derniers jours, hors essentiels.
 * Rien si aucune habitude ne ressort : mieux vaut pas de conseil qu'un conseil générique.
 */
export function savingsTip(state: AppState, today: string): SavingsTip | null {
  const from = addDays(today, -(TIP_DAYS - 1));
  const groups = new Map<string, { label: string; category: SpendingCategory; cents: number; count: number; spellings: Map<string, number> }>();
  for (const { date, amount, category, label, paidFrom } of spendingsOf(state)) {
    if (category === 'household' || !DISCRETIONARY.has(category) || date < from || date > today || paidFrom === 'personal') continue;
    const named = label?.trim();
    // « Autre » sans libellé ne dit rien d'actionnable ; ailleurs, la catégorie elle-même est l'habitude.
    if (!named && category === 'other') continue;
    const key = named ? `l:${labelKey(named)}` : `c:${category}`;
    const group = groups.get(key) ?? { label: named ?? spendingCategoryLabels[category], category, cents: 0, count: 0, spellings: new Map() };
    group.cents += toCents(amount);
    group.count += 1;
    if (named) group.spellings.set(named, (group.spellings.get(named) ?? 0) + 1);
    groups.set(key, group);
  }
  const best = [...groups.values()]
    .filter(({ count, cents }) => count >= MIN_COUNT && cents >= MIN_TOTAL_CENTS)
    .sort((first, second) => second.cents - first.cents || second.count - first.count)[0];
  if (!best) return null;
  const label = best.spellings.size > 0
    ? [...best.spellings].sort((first, second) => second[1] - first[1]
      || Number(/^\p{Lu}/u.test(second[0])) - Number(/^\p{Lu}/u.test(first[0])))[0][0]
    : best.label;
  return {
    label,
    category: best.category,
    count: best.count,
    total: fromCents(best.cents),
    yearly: fromCents(best.cents * 12),
    halfPerMonth: fromCents(Math.round(best.cents / 2)),
  };
}
