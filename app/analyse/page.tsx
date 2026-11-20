'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CircleHelp, HandCoins } from 'lucide-react';
import { CompactRows, DetailSheet } from '@/components/budget/CompactRows';
import EnvelopeForm from '@/components/spending/EnvelopeForm';
import EnvelopeScenario from '@/components/spending/EnvelopeScenario';
import NewSpendingAction from '@/components/spending/NewSpendingAction';
import SpendingMonthSelector from '@/components/spending/SpendingMonthSelector';
import { spendingCategoryIcons } from '@/components/spending/category-icons';
import AlertBanner from '@/components/ui/AlertBanner';
import Card from '@/components/ui/Card';
import { expenseCategoryIcons, expenseCategoryLabels } from '@/components/ui/icons';
import { formatCurrency, formatDate } from '@/lib/budget-calculations';
import { useApp } from '@/lib/context/AppContext';
import { addMonths, isLocalDate, parseLocalDate } from '@/lib/local-date';
import { fromCents } from '@/lib/money';
import { envelopesOf, spendingCategoryLabels } from '@/lib/spending';
import { analyzeMonth, monthItems, type AnalysisCategory } from '@/lib/spending-analysis';
import type { SpendingCategory } from '@/lib/types';

const percentFormatter = new Intl.NumberFormat('fr-BE', { style: 'percent', maximumFractionDigits: 1 });
const monthFormatter = new Intl.DateTimeFormat('fr-BE', { month: 'long' });
const actionClass = 'inline-flex min-h-11 items-center rounded-xl border border-teal-200 bg-white px-3 text-sm font-semibold text-teal-800 hover:bg-teal-50 disabled:opacity-50';

function isSpendingCategory(category: AnalysisCategory): category is SpendingCategory {
  return Object.hasOwn(spendingCategoryLabels, category);
}

function categoryPresentation(category: AnalysisCategory) {
  if (category === 'debts') return { title: 'Dettes', icon: HandCoins };
  if (category === 'unrecorded') return { title: 'Non encodé', icon: CircleHelp };
  return isSpendingCategory(category)
    ? { title: spendingCategoryLabels[category], icon: spendingCategoryIcons[category] }
    : { title: expenseCategoryLabels[category], icon: expenseCategoryIcons[category] };
}

function compareToPrevious(deltaCents: number, previousMonth: string): string {
  if (!previousMonth) return 'Pas de comparaison';
  if (deltaCents === 0) return `Comme en ${previousMonth}`;
  const sign = deltaCents > 0 ? '+' : '−';
  return `${sign}${formatCurrency(fromCents(Math.abs(deltaCents)))} par rapport à ${previousMonth}`;
}

export default function AnalysisPage() {
  const state = useApp();
  const [selectedMonth, setSelectedMonth] = useState<string>();
  const [selectedCategory, setSelectedCategory] = useState<AnalysisCategory>();
  const [creatingEnvelope, setCreatingEnvelope] = useState(false);
  const currentMonth = state.today.slice(0, 7);
  const month = selectedMonth && selectedMonth <= currentMonth ? selectedMonth : currentMonth;
  const analysis = analyzeMonth(state, month);
  const previousDate = addMonths(`${month}-01`, -1);
  const previousMonth = isLocalDate(previousDate) && analyzeMonth(state, previousDate.slice(0, 7)).rows.length > 0
    ? monthFormatter.format(parseLocalDate(previousDate))
    : '';
  const rows = analysis.rows.map(({ category, cents, previousCents }) => {
    const share = analysis.totalCents > 0 ? cents / analysis.totalCents : 0;
    const gap = category === 'unrecorded';
    return {
      id: category,
      ...categoryPresentation(category),
      tone: gap ? 'neutral' as const : undefined,
      amount: formatCurrency(fromCents(cents)),
      amountNote: percentFormatter.format(share),
      meta: compareToPrevious(cents - previousCents, previousMonth),
      footer: (
        <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-slate-100">
          <span className={`block h-full rounded-full ${gap ? 'bg-slate-500' : 'bg-teal-700'}`}
            style={{ width: `${share * 100}%` }} />
        </span>
      ),
    };
  });
  const selected = analysis.rows.find((row) => row.category === selectedCategory);
  const envelopeCategory = selectedCategory && isSpendingCategory(selectedCategory) ? selectedCategory : undefined;
  const envelope = envelopeCategory ? envelopesOf(state).find(({ category }) => category === envelopeCategory) : undefined;
  const items = selectedCategory ? monthItems(state, month, selectedCategory) : [];
  const averageCents = selected?.averageCents ?? null;
  const monthlyAmount = averageCents === null ? undefined : fromCents(Math.ceil(averageCents / 500) * 500);
  const close = () => setSelectedCategory(undefined);

  if (state.isBudgetLoading) {
    return <p role="status" className="px-4 py-6 text-sm text-gray-600">Chargement du budget…</p>;
  }

  return (
    <div className="space-y-4 px-4 py-4">
      <h1 className="text-xl font-bold text-slate-900">Où part mon argent</h1>
      {state.storageBlocked && (
        <AlertBanner variant="warning" title="Stockage indisponible">
          Les données enregistrées ne peuvent pas être mises à jour dans ce navigateur.
        </AlertBanner>
      )}
      <SpendingMonthSelector month={month} currentMonth={currentMonth} onChange={(value) => {
        setSelectedMonth(value);
        close();
      }} />
      <Card>
        <p className="text-sm font-medium text-slate-700">Total du mois</p>
        <p className="text-2xl font-bold tabular-nums text-slate-900">{formatCurrency(fromCents(analysis.totalCents))}</p>
      </Card>
      {analysis.unrecordedCents * 5 > analysis.totalCents && (
        <AlertBanner variant="warning">
          Une partie de tes dépenses n’est pas encodée : l’analyse est incomplète.
        </AlertBanner>
      )}
      {rows.length > 0
        ? <CompactRows rows={rows} onOpen={(id) => setSelectedCategory(rows.find((row) => row.id === id)?.id)} />
        : <p className="text-sm text-slate-600">Aucune dépense à analyser pour ce mois.</p>}

      {selectedCategory && (
        <DetailSheet title={categoryPresentation(selectedCategory).title} onClose={close}>
          {selectedCategory === 'unrecorded' && (
            <p className="text-sm text-slate-700">
              Différence entre ton solde recopié de la banque et ce que tu as encodé. Encode tes dépenses pour réduire cette ligne.
            </p>
          )}
          {items.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <li key={`${item.source}-${item.id}-${item.date}`} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0 wrap-break-word">
                    <p className="font-medium text-slate-900">{item.label}</p>
                    <time className="text-xs text-slate-600" dateTime={item.date}>{formatDate(item.date)}</time>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums text-slate-900">{formatCurrency(fromCents(item.cents))}</span>
                </li>
              ))}
            </ul>
          )}
          {envelope && <EnvelopeScenario envelope={envelope} onApplied={close} />}
          {!envelope && envelopeCategory && selected && (
            <div className="space-y-2">
              <p className="text-sm text-slate-700">
                {averageCents === null
                  ? `Ce mois-ci : ${formatCurrency(fromCents(selected.cents))}`
                  : `Tu y as dépensé en moyenne ${formatCurrency(fromCents(averageCents))} par mois.`}
              </p>
              <button type="button" disabled={state.storageBlocked} className={actionClass} onClick={() => setCreatingEnvelope(true)}>
                Créer une enveloppe
              </button>
            </div>
          )}
          {selectedCategory === 'unrecorded' && <NewSpendingAction />}
          {selectedCategory === 'debts' && (
            <Link href="/dettes" className={actionClass}>Voir mes dettes</Link>
          )}
          {!envelopeCategory && selectedCategory !== 'debts' && selectedCategory !== 'unrecorded' && (
            <Link href="/charges" className={actionClass}>Voir mes charges</Link>
          )}
        </DetailSheet>
      )}
      {creatingEnvelope && envelopeCategory && (
        <EnvelopeForm prefill={{ category: envelopeCategory, monthlyAmount }} onClose={() => setCreatingEnvelope(false)} />
      )}
    </div>
  );
}
