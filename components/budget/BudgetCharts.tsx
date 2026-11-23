'use client';

import Link from 'next/link';
import { CircleHelp, HandCoins } from 'lucide-react';
import DonutChart from '@/components/charts/DonutChart';
import { spendingCategoryIcons } from '@/components/spending/category-icons';
import { expenseCategoryIcons, expenseCategoryLabels } from '@/components/ui/icons';
import { monthlyChargesByCategory } from '@/lib/budget-calculations';
import { chartParts } from '@/lib/chart-parts';
import { useApp } from '@/lib/context/AppContext';
import { spendingCategoryLabels } from '@/lib/spending';
import { isSpendingCategory, type AnalysisCategory, type MonthAnalysis } from '@/lib/spending-analysis';

export const surface = 'rounded-[19px] border border-cap-border bg-cap-surface p-4 shadow-[0_1px_2px_rgba(23,44,55,0.04)]';
const linkClass = 'inline-flex min-h-11 items-center text-sm font-semibold text-cap-primary-text underline';

export function categoryPresentation(category: AnalysisCategory) {
  if (category === 'debts') return { title: 'Dettes', icon: HandCoins };
  if (category === 'unrecorded') return { title: 'Non encodé', icon: CircleHelp };
  return isSpendingCategory(category)
    ? { title: spendingCategoryLabels[category], icon: spendingCategoryIcons[category] }
    : { title: expenseCategoryLabels[category], icon: expenseCategoryIcons[category] };
}

/** Charges programmées par catégorie, ramenées au mois. */
export function ChargesDonut({ links = false }: { links?: boolean }) {
  const { expenses, today } = useApp();
  const rows = monthlyChargesByCategory(expenses, today);
  const parts = chartParts(rows, ({ category }) => expenseCategoryLabels[category]);
  if (parts.length === 0) {
    return (
      <section aria-label="Répartition des charges" className={`space-y-2 ${surface}`}>
        <p className="text-sm text-cap-text-muted">Aucune charge récurrente en cours à répartir. Tu peux encoder ton loyer, ton énergie ou tes assurances.</p>
        {links && <Link href="/charges" className={linkClass}>Ajouter mes charges</Link>}
      </section>
    );
  }
  const totalCents = rows.reduce((sum, { cents }) => sum + cents, 0);
  return (
    <section aria-label="Répartition des charges" className={`space-y-3 ${surface}`}>
      <DonutChart title="Répartition des charges" totalLabel="par mois" totalCents={totalCents} parts={parts}
        scope="Charges programmées ramenées au mois, pas les dépenses réellement effectuées." />
      {links && <Link href="/charges" className={linkClass}>Voir mes charges</Link>}
    </section>
  );
}

/** Ce qui a réellement été payé ce mois-ci : paiements, mensualités et dépenses encodées (sans la part non encodée). */
export function SpendingDonut({ analysis, links = false, title = 'Où part mon argent' }: {
  analysis: MonthAnalysis; links?: boolean; title?: string;
}) {
  const recorded = analysis.rows.filter(({ category }) => category !== 'unrecorded');
  const parts = chartParts(recorded, ({ category }) => categoryPresentation(category).title);
  const detail = links && (
    <div className="flex flex-wrap gap-x-4">
      <Link href="/analyse" className={linkClass}>Voir le détail</Link>
      <Link href="/depenses" className={linkClass}>Dépenses et enveloppes</Link>
    </div>
  );
  if (parts.length === 0) {
    return (
      <section aria-label="Répartition des dépenses enregistrées" className={`space-y-2 ${surface}`}>
        <p className="text-sm text-cap-text-muted">Rien d’enregistré ce mois-ci. Touche « Dépense » en bas de l’écran pour encoder un achat.</p>
        {detail}
      </section>
    );
  }
  const recordedCents = recorded.reduce((sum, { cents }) => sum + cents, 0);
  return (
    <section aria-label="Répartition des dépenses enregistrées" className={`space-y-3 ${surface}`}>
      <DonutChart title={title} totalLabel="ce mois-ci" totalCents={recordedCents} parts={parts}
        scope="Dépenses enregistrées ce mois-ci : paiements, mensualités et dépenses encodées. La part non encodée n’y figure pas." />
      {detail}
    </section>
  );
}
