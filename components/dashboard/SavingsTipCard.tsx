'use client';

import Link from 'next/link';
import { Lightbulb } from 'lucide-react';
import { formatCurrency } from '@/lib/budget-calculations';
import { useApp } from '@/lib/context/AppContext';
import { savingsTip, TIP_DAYS } from '@/lib/savings-tip';
import { Icon } from '@/components/ui/icons';

const roundEuros = (value: number) => new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
  .format(Math.round(value));

/** Une seule piste d'économie, tirée des dépenses encodées : un constat chiffré, pas un jugement. */
export default function SavingsTipCard() {
  const state = useApp();
  const tip = savingsTip(state, state.today);
  if (!tip) return null;
  return (
    <section aria-labelledby="savings-tip" className="space-y-1.5 rounded-2xl border border-cap-border bg-cap-surface p-4 text-sm text-cap-text">
      <h2 id="savings-tip" className="flex items-center gap-2 font-semibold">
        <Icon icon={Lightbulb} className="size-4 text-cap-warning-text" />
        Une piste d’économie
      </h2>
      <p>
        <strong>{tip.label}</strong> : {formatCurrency(tip.total)} sur les {TIP_DAYS} derniers jours ({tip.count} fois).
        À ce rythme, ≈ {roundEuros(tip.yearly)} par an.
      </p>
      <p className="text-cap-text-muted">En réduire la moitié te ferait garder ≈ {formatCurrency(tip.halfPerMonth)} par mois.</p>
      <Link href="/analyse" className="inline-flex min-h-11 items-center font-semibold text-cap-primary-text underline">
        Voir où part mon argent
      </Link>
    </section>
  );
}
