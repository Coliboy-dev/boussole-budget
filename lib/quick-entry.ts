import { isSpendingAmount } from './budget-schema.ts';
import { parseAmountInput } from './money.ts';

const amountPattern = new RegExp(
  '(^|[^\\p{L}\\p{N}.,+\\-])(?:€\\s*)?([+\\-]?[0-9]+)'
  + '(?:[.,]([0-9]{1,2})|\\s*(?:€|euros?\\b|eur\\b)\\s*([0-9]{1,2}))?'
  + '(?![\\p{L}\\p{N}]|[.,][0-9])',
  'iu',
);
const fillerWords = new RegExp(
  "(^|[^\\p{L}\\p{N}])(?:j[’']ai\\s+(?:dépensé|payé)|euros?|eur|chez|au|à\\s+la|à|pour)(?=$|[^\\p{L}\\p{N}])",
  'giu',
);

export function parseQuickEntry(text: string): { amount?: number; label?: string } {
  const match = amountPattern.exec(text);
  let remainder = text;
  let amount: number | undefined;
  if (match) {
    const [full, separator, whole, decimal, currencyDecimal] = match;
    const fraction = decimal ?? currencyDecimal;
    const parsed = parseAmountInput(fraction ? `${whole},${fraction}` : whole);
    if (isSpendingAmount(parsed)) amount = parsed;
    remainder = text.slice(0, match.index) + separator + ' ' + text.slice(match.index + full.length);
  }

  const label = remainder.replace(fillerWords, '$1').replace(/€/g, ' ').replace(/\s+/g, ' ').trim();
  return { ...(amount !== undefined && { amount }), ...(label && { label }) };
}
