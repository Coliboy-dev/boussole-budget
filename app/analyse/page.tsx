'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CompactRows, DetailSheet } from '@/components/budget/CompactRows';
import EnvelopeForm from '@/components/spending/EnvelopeForm';
import EnvelopeScenario from '@/components/spending/EnvelopeScenario';
import LabelBreakdown from '@/components/spending/LabelBreakdown';
import NewSpendingAction from '@/components/spending/NewSpendingAction';
import SpendingMonthSelector from '@/components/spending/SpendingMonthSelector';
import AlertBanner from '@/components/ui/AlertBanner';
import { categoryPresentation, SpendingDonut, surface } from '@/components/budget/BudgetCharts';
import { formatCurrency, formatDate } from '@/lib/budget-calculations';
import { useApp } from '@/lib/context/AppContext';
import { addMonths, isLocalDate, parseLocalDate } from '@/lib/local-date';
import { fromCents } from '@/lib/money';
import { envelopesOf } from '@/lib/spending';
import { analyzeMonth, envelopeSuggestion, isSpendingCategory, monthItems, type AnalysisCategory } from '@/lib/spending-analysis';
import { householdMessages } from '@/lib/household-copy';

const percentFormatter = new Intl.NumberFormat('fr-BE', { style: 'percent', maximumFractionDigits: 1 });
const monthFormatter = new Intl.DateTimeFormat('fr-BE', { month: 'long' });
const actionClass = 'inline-flex min-h-11 items-center rounded-xl border border-cap-border bg-cap-surface px-3 text-sm font-semibold text-cap-primary-text hover:bg-cap-surface-soft disabled:opacity-50';

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
        <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-cap-border">
          <span className={`block h-full rounded-full ${gap ? 'bg-cap-border-strong' : 'bg-[var(--cap-chart-1)]'}`}
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
  const suggestion = selectedCategory ? envelopeSuggestion(selectedCategory, averageCents) : null;
  const close = () => setSelectedCategory(undefined);

  if (state.isBudgetLoading) {
    return <p role="status" className="px-4 py-6 text-sm text-gray-600">Chargement du budget…</p>;
  }

  return (
    <div className="space-y-4 px-4 py-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-cap-text">Où part mon argent</h1>
        <p className="text-sm text-cap-text-muted">Ce que tu as réellement payé, mois par mois.</p>
      </header>
      {state.storageBlocked && (
        <AlertBanner variant="warning" title="Stockage indisponible">
          Les données enregistrées ne peuvent pas être mises à jour dans ce navigateur.
        </AlertBanner>
      )}
      <SpendingMonthSelector month={month} currentMonth={currentMonth} onChange={(value) => {
        setSelectedMonth(value);
        close();
      }} />
      <section aria-label="Total du mois" className={surface}>
        <p className="text-sm font-medium text-cap-text-muted">Total du mois</p>
        <p className="font-display text-2xl font-bold tabular-nums text-cap-text">{formatCurrency(fromCents(analysis.totalCents))}</p>
      </section>
      {analysis.rows.some(({ category, cents }) => category !== 'unrecorded' && cents > 0) && (
        <SpendingDonut analysis={analysis} title="Répartition des dépenses" />
      )}
      {analysis.unrecordedCents * 5 > analysis.totalCents && (
        <AlertBanner variant="warning">
          Une partie de tes dépenses n’est pas encodée : l’analyse est incomplète.
        </AlertBanner>
      )}
      {rows.length > 0
        ? <CompactRows rows={rows} onOpen={(id) => setSelectedCategory(rows.find((row) => row.id === id)?.id)} />
        : <p className="text-sm text-cap-text-muted">Aucune dépense à analyser pour ce mois.</p>}
      {!!analysis.transfersCents && (
        <p className="px-1 text-sm text-cap-text">{householdMessages.transfersForHousehold(analysis.transfersCents)}</p>
      )}
      {!!analysis.receivedTransfersCents && (
        <p className="px-1 text-sm text-cap-text">{householdMessages.receivedTransfers(analysis.receivedTransfersCents)}</p>
      )}

      {selectedCategory && (
        <DetailSheet title={categoryPresentation(selectedCategory).title} onClose={close}>
          {selectedCategory === 'unrecorded' && (
            <p className="text-sm text-slate-700">
              Différence entre ton solde recopié de la banque et ce que tu as encodé. Encode tes dépenses pour réduire cette ligne.
            </p>
          )}
          {envelopeCategory && <LabelBreakdown month={month} category={envelopeCategory} monthCents={analysis.totalCents} />}
          {envelopeCategory && items.length > 0 && <h3 className="pt-2 text-sm font-bold text-cap-text">Détail</h3>}
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
          {!envelope && suggestion && selected && (
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
      {creatingEnvelope && envelopeCategory && suggestion && (
        <EnvelopeForm prefill={{ category: envelopeCategory, ...suggestion }} onClose={() => setCreatingEnvelope(false)} />
      )}
    </div>
  );
}
