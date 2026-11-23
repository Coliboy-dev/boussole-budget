import type { Frequency } from './types.ts';

export function toCents(amount: number): number {
  const absolute = Math.abs(amount);
  const cents = Math.round((absolute + Number.EPSILON * absolute) * 100);
  return cents === 0 ? 0 : Math.sign(amount) * cents;
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function monthlyCents(amount: number, frequency: Frequency): number {
  const cents = toCents(amount);
  switch (frequency) {
    case 'weekly':
      return Math.round(cents * 52 / 12);
    case 'bi_monthly':
      return Math.round(cents / 2);
    case 'quarterly':
      return Math.round(cents / 3);
    case 'annual':
      return Math.round(cents / 12);
    case 'one_time':
      return 0;
    default:
      return cents;
  }
}

/**
 * Montant saisi au clavier, en notation belge ou internationale : « 12,34 », « 12.34 », « 1 234,50 ».
 * Deux décimales au maximum ; tout le reste (« 12,345 », « 1.234,5 », lettres) donne NaN.
 */
export function parseAmountInput(text: string): number {
  const value = text.trim();
  if (!/^[+-]?(?:(?:\d+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)(?:[.,]\d{1,2})?|[.,]\d{1,2})$/.test(value)) {
    return NaN;
  }
  return Number(value.replace(/[ \u00a0\u202f]/g, '').replace(',', '.'));
}

/** La case Découvert fixe le signe sans inverser un montant déjà négatif. */
export function parseBalanceInput(text: string, overdrawn: boolean): number {
  const amount = parseAmountInput(text.trim().replace(/^−/, '-'));
  return overdrawn && amount > 0 ? -amount : amount;
}

/** Montant facultatif : champ vide = `empty`, sinon même lecture stricte que parseAmountInput. */
export function parseOptionalAmount(text: string, empty: number): number {
  return text.trim() === '' ? empty : parseAmountInput(text);
}

/** Montant prêt à être retouché dans un champ texte : « 12,34 » plutôt que « 12.34 ». */
export function amountInputValue(amount: number | undefined): string | undefined {
  return amount === undefined || !Number.isFinite(amount) ? undefined : String(amount).replace('.', ',');
}
