'use client';

import { formatCurrency } from '@/lib/budget-calculations';
import { useApp } from '@/lib/context/AppContext';
import { labelBreakdown } from '@/lib/label-breakdown';
import { fromCents } from '@/lib/money';
import type { SpendingCategory } from '@/lib/types';

const percent = new Intl.NumberFormat('fr-BE', { style: 'percent', maximumFractionDigits: 0 });
const euros = (cents: number) => formatCurrency(fromCents(cents));
/** L'estimation annuelle est arrondie à l'euro : c'est un ordre de grandeur, pas un montant exact. */
const roundEuros = (cents: number) => new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
  .format(Math.round(cents / 100));

/**
 * Où part l'argent d'une catégorie, libellé par libellé : « Café : 22 fois, 48 € ce mois-ci, ≈ 580 € par an ».
 * Utile surtout pour « Autre », la catégorie fourre-tout où se cachent les petites habitudes.
 */
export default function LabelBreakdown({ month, category, monthCents }: {
  month: string; category: SpendingCategory; monthCents: number;
}) {
  const state = useApp();
  const { rows } = labelBreakdown(state, month, category, state.today.slice(0, 7));
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="par-libelle" className="space-y-2">
      <h3 id="par-libelle" className="text-sm font-bold text-cap-text">Par libellé</h3>
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className={`min-w-0 wrap-break-word font-semibold ${row.rest ? 'text-cap-text-muted' : 'text-cap-text'}`}>{row.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-cap-text">{euros(row.cents)}</span>
            </div>
            <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-cap-border">
              <span className={`block h-full rounded-full ${row.rest ? 'bg-[var(--cap-chart-other)]' : 'bg-[var(--cap-chart-1)]'}`}
                style={{ width: `${row.share * 100}%` }} />
            </span>
            <p className="text-xs tabular-nums text-cap-text-muted">
              {row.count} fois · {percent.format(row.share)} de la catégorie
              {monthCents > 0 && <> · {percent.format(row.cents / monthCents)} du mois</>}
            </p>
            {row.yearlyCents !== null && row.yearlyCents > 0 && (
              <p className="text-xs font-medium tabular-nums text-cap-text">≈ {roundEuros(row.yearlyCents)} par an à ce rythme</p>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-cap-text-muted">
        « Par an » : moyenne de tes derniers mois complets, multipliée par douze. Les libellés sont regroupés sans tenir compte des majuscules ni des accents.
      </p>
    </section>
  );
}
