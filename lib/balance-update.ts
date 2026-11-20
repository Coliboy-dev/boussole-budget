import { recordPayment, type AppState } from './budget-state.ts';
import { daysBetween } from './local-date.ts';
import { fromCents, toCents } from './money.ts';
import { forecastOccurrences } from './occurrences.ts';

/** Échéance que la personne confirme comme déjà passée sur son compte. */
export interface SettledOccurrence {
  type: 'income' | 'expense' | 'debt';
  id: string;
  dueDate: string;
}

export interface PassedOccurrence extends SettledOccurrence {
  label: string;
  amountCents: number;
  /** Prévue après la dernière mise à jour du solde : probablement déjà passée sur le compte. */
  sinceLastBalance: boolean;
}

/** Délai après lequel le solde enregistré est jugé ancien. */
export const STALE_BALANCE_DAYS = 3;

/**
 * Échéances encore ouvertes dont la date est atteinte : un nouveau solde bancaire
 * les contient peut-être déjà. Les compter encore les déduirait deux fois.
 */
export function passedOccurrences(state: AppState, today: string): PassedOccurrence[] {
  return forecastOccurrences(state.incomes, state.expenses, state.debts, [], today, today)
    .filter((occurrence) => occurrence.type !== 'child' && occurrence.dueDate <= today)
    .map((occurrence) => ({
      type: occurrence.type as SettledOccurrence['type'],
      id: occurrence.sourceId,
      dueDate: occurrence.dueDate,
      label: occurrence.label,
      amountCents: occurrence.amountCents,
      sinceLastBalance: Boolean(state.balanceDate) && occurrence.dueDate > state.balanceDate!,
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.label.localeCompare(b.label));
}

/**
 * Remplace le solde par celui de la banque et marque comme réglées les échéances
 * que ce solde contient déjà, sans les déduire une seconde fois.
 */
export function updateBalance(
  state: AppState,
  { amount, today, settled = [] }: { amount: number; today: string; settled?: SettledOccurrence[] },
): AppState {
  let next: AppState = { ...state, currentBalance: fromCents(toCents(amount)), balanceDate: today };
  for (const item of settled) {
    next = recordPayment(next, { ...item, today, balanceIncludesPayment: true });
  }
  return next;
}

/** Âge du solde enregistré et nombre d’échéances passées depuis. */
export function balanceFreshness(state: AppState, today: string) {
  if (!state.balanceDate) return { days: null, passedSince: 0, stale: false };
  const days = daysBetween(state.balanceDate, today);
  const passedSince = passedOccurrences(state, today).filter((item) => item.sinceLastBalance).length;
  return { days, passedSince, stale: days >= STALE_BALANCE_DAYS || passedSince > 0 };
}
