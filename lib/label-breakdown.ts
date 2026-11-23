import { addMonths, isLocalDate } from './local-date.ts';
import { spendingCategoryLabels, spendingsOf } from './spending.ts';
import { analyzeMonth, monthItems } from './spending-analysis.ts';
import type { AppState } from './budget-state.ts';
import type { SpendingCategory } from './types.ts';

/** « Café », « café » et « cafe » ne font qu'un : casse, accents et espaces ignorés. */
export function labelKey(label: string): string {
  return label.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('fr-BE').replace(/\s+/g, ' ').trim();
}

export interface LabelRow {
  key: string;
  /** Orthographe la plus utilisée, ou « Sans libellé ». */
  label: string;
  cents: number;
  count: number;
  /** Part de la catégorie ce mois-là. */
  share: number;
  /** Moyenne des mois complets × 12 ; null tant qu'aucun mois complet n'est connu. */
  yearlyCents: number | null;
  /** Regroupe les plus petits libellés. */
  rest?: true;
}

const NO_LABEL = 'Sans libellé';

function groups(state: AppState, month: string, category: SpendingCategory) {
  const fallback = spendingCategoryLabels[category];
  const byKey = new Map<string, { cents: number; count: number; spellings: Map<string, number> }>();
  for (const { label, cents, source } of monthItems(state, month, category)) {
    if (source !== 'spending') continue;
    // Sans libellé, l'analyse affiche le nom de la catégorie : on le regroupe à part.
    const named = label && label !== fallback ? label.trim() : NO_LABEL;
    const key = named === NO_LABEL ? '' : labelKey(named);
    const group = byKey.get(key) ?? { cents: 0, count: 0, spellings: new Map() };
    group.cents += cents;
    group.count += 1;
    group.spellings.set(named, (group.spellings.get(named) ?? 0) + 1);
    byKey.set(key, group);
  }
  return byKey;
}

/**
 * Où part l'argent d'une catégorie, libellé par libellé, pour un mois donné.
 * L'estimation annuelle ne repose que sur des mois complets où le budget était tenu, jamais sur le mois en cours.
 */
export function labelBreakdown(state: AppState, month: string, category: SpendingCategory, currentMonth: string, limit = 5): {
  rows: LabelRow[]; categoryCents: number;
} {
  const current = groups(state, month, category);
  const categoryCents = [...current.values()].reduce((sum, { cents }) => sum + cents, 0);
  if (categoryCents <= 0) return { rows: [], categoryCents: 0 };

  const start = `${month}-01`;
  const reference = month < currentMonth ? [0, 1, 2] : [1, 2, 3];
  const complete = isLocalDate(start)
    ? reference.map((offset) => addMonths(start, -offset).slice(0, 7))
      .filter((candidate) => candidate < currentMonth && analyzeMonth(state, candidate).totalCents > 0)
    : [];
  const history = complete.map((candidate) => groups(state, candidate, category));
  const yearly = (key: string) => (history.length === 0
    ? null
    : Math.round((history.reduce((sum, period) => sum + (period.get(key)?.cents ?? 0), 0) / history.length) * 12));

  const sorted = [...current].map(([key, { cents, count, spellings }]) => ({
    key,
    // Orthographe la plus fréquente ; à égalité, celle qui commence par une majuscule (« Tabac » plutôt que « tabac »).
    label: [...spellings].sort((first, second) => second[1] - first[1]
      || Number(/^\p{Lu}/u.test(second[0])) - Number(/^\p{Lu}/u.test(first[0])))[0][0],
    cents,
    count,
    share: cents / categoryCents,
    yearlyCents: yearly(key),
  })).sort((first, second) => second.cents - first.cents || first.label.localeCompare(second.label, 'fr-BE'));

  if (sorted.length <= limit + 1) return { rows: sorted, categoryCents };
  const kept = sorted.slice(0, limit);
  const others = sorted.slice(limit);
  const restCents = others.reduce((sum, { cents }) => sum + cents, 0);
  const restYearly = others.every(({ yearlyCents }) => yearlyCents === null)
    ? null
    : others.reduce((sum, { yearlyCents }) => sum + (yearlyCents ?? 0), 0);
  return {
    rows: [...kept, {
      key: '…', label: `${others.length} autres libellés`, cents: restCents, count: others.reduce((sum, { count }) => sum + count, 0),
      share: restCents / categoryCents, yearlyCents: restYearly, rest: true,
    }],
    categoryCents,
  };
}

/** Libellés déjà utilisés, les plus fréquents d'abord ; ceux de la catégorie choisie en tête. */
export function labelSuggestions(state: AppState, category: SpendingCategory | '', today: string, max = 12): string[] {
  const from = addMonths(today, -3);
  const counts = new Map<string, { label: string; count: number; same: boolean }>();
  for (const spending of spendingsOf(state)) {
    if (!spending.label?.trim() || spending.date < from || spending.category === 'household') continue;
    const key = labelKey(spending.label);
    const entry = counts.get(key) ?? { label: spending.label.trim(), count: 0, same: false };
    entry.count += 1;
    entry.same ||= spending.category === category;
    counts.set(key, entry);
  }
  return [...counts.values()]
    .sort((first, second) => Number(second.same) - Number(first.same) || second.count - first.count || first.label.localeCompare(second.label, 'fr-BE'))
    .slice(0, max)
    .map(({ label }) => label);
}
