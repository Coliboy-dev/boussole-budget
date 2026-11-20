'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { CompactRows, DetailFact, DetailSheet, type CompactRow } from '@/components/budget/CompactRows';
import EnvelopeForm from '@/components/spending/EnvelopeForm';
import NewSpendingAction from '@/components/spending/NewSpendingAction';
import QuickSpendingSheet from '@/components/spending/QuickSpendingSheet';
import { spendingCategoryIcons } from '@/components/spending/category-icons';
import AlertBanner from '@/components/ui/AlertBanner';
import Badge from '@/components/ui/Badge';
import { Icon } from '@/components/ui/icons';
import { formatCurrency, formatDate } from '@/lib/budget-calculations';
import { useApp } from '@/lib/context/AppContext';
import { spentInMonth } from '@/lib/envelopes';
import { addMonths, parseLocalDate } from '@/lib/local-date';
import { fromCents, toCents } from '@/lib/money';
import { envelopesOf, spendingCategoryLabels, spendingsOf } from '@/lib/spending';
import type { Envelope, Spending } from '@/lib/types';

const monthFormatter = new Intl.DateTimeFormat('fr-BE', { month: 'long', year: 'numeric' });
const monthButton = 'flex size-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 text-teal-800 hover:bg-teal-50 disabled:opacity-50';

type Panel =
  | { type: 'spending' | 'edit-spending'; id: string }
  | { type: 'envelope' | 'edit-envelope'; id: string }
  | { type: 'new-envelope' };

function spendingTitle(spending: Spending): string {
  return spending.label || spendingCategoryLabels[spending.category];
}

function envelopeRow(envelope: Envelope, spentCents: number): CompactRow {
  const limit = toCents(envelope.monthlyAmount);
  const remaining = limit - spentCents;
  const progress = limit > 0 ? Math.min(100, 100 * spentCents / limit) : spentCents > 0 ? 100 : 0;

  return {
    id: envelope.id,
    title: envelope.label,
    icon: spendingCategoryIcons[envelope.category],
    badges: remaining < 0
      ? <Badge variant="danger">Dépassée de {formatCurrency(fromCents(-remaining))}</Badge>
      : undefined,
    amount: formatCurrency(fromCents(spentCents)),
    amountNote: <>sur {formatCurrency(envelope.monthlyAmount)}</>,
    meta: remaining >= 0 ? `${formatCurrency(fromCents(remaining))} restants` : undefined,
    footer: (
      <span className="block h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <span className={`block h-full rounded-full ${remaining < 0 ? 'bg-red-700' : 'bg-teal-700'}`}
          style={{ width: `${progress}%` }} />
      </span>
    ),
  };
}

export default function SpendingPage() {
  const state = useApp();
  const { today, storageBlocked, isBudgetLoading, lastAddedSpendingId } = state;
  const [selectedMonth, setSelectedMonth] = useState<string>();
  const [panel, setPanel] = useState<Panel>();
  const currentMonth = today.slice(0, 7);
  const month = selectedMonth && selectedMonth <= currentMonth ? selectedMonth : currentMonth;
  const firstDay = `${month}-01`;
  const monthTitle = monthFormatter.format(parseLocalDate(firstDay));
  const spendings = spendingsOf(state);
  const envelopes = envelopesOf(state);
  const envelopeRows = envelopes.map((item) => envelopeRow(item, spentInMonth(spendings, item.category, month)));
  const byDay = new Map<string, CompactRow[]>();
  for (const item of spendings.filter(({ date }) => date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date))) {
    const rows = byDay.get(item.date) ?? [];
    rows.push({
      id: item.id,
      title: spendingTitle(item),
      icon: spendingCategoryIcons[item.category],
      meta: item.label ? spendingCategoryLabels[item.category] : undefined,
      amount: formatCurrency(item.amount),
    });
    byDay.set(item.date, rows);
  }
  const envelope = panel && 'id' in panel ? envelopes.find(({ id }) => id === panel.id) : undefined;
  const spending = panel && 'id' in panel ? spendings.find(({ id }) => id === panel.id) : undefined;
  const close = () => setPanel(undefined);

  if (isBudgetLoading) {
    return <p role="status" className="px-4 py-6 text-sm text-gray-600">Chargement du budget…</p>;
  }

  return (
    <div className={`space-y-4 px-4 py-4 ${lastAddedSpendingId ? 'pb-28' : ''}`}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900">Dépenses du mois</h1>
        <NewSpendingAction />
      </header>
      {storageBlocked && (
        <AlertBanner variant="warning" title="Stockage indisponible">
          Les données enregistrées ne peuvent pas être mises à jour dans ce navigateur.
        </AlertBanner>
      )}
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-white p-2">
        <button type="button" aria-label="Mois précédent" className={monthButton}
          onClick={() => setSelectedMonth(addMonths(firstDay, -1).slice(0, 7))}>
          <Icon icon={ChevronLeft} />
        </button>
        <p role="status" className="text-center text-sm font-semibold text-slate-900">{monthTitle}</p>
        <button type="button" aria-label="Mois suivant" className={monthButton} disabled={month >= currentMonth}
          onClick={() => setSelectedMonth(addMonths(firstDay, 1).slice(0, 7))}>
          <Icon icon={ChevronRight} />
        </button>
      </div>
      <section aria-labelledby="enveloppes" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="enveloppes" className="font-semibold text-slate-900">Enveloppes</h2>
          <button type="button" disabled={storageBlocked || envelopes.length >= Object.keys(spendingCategoryLabels).length}
            onClick={() => setPanel({ type: 'new-envelope' })}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-teal-200 bg-white px-3 text-sm font-semibold text-teal-800 hover:bg-teal-50 disabled:opacity-50">
            <Icon icon={Plus} /> Créer une enveloppe
          </button>
        </div>
        {envelopeRows.length > 0
          ? <CompactRows rows={envelopeRows} onOpen={(id) => setPanel({ type: 'envelope', id })} />
          : <p className="text-sm text-slate-600">Aucune enveloppe pour l’instant.</p>}
      </section>
      <section aria-labelledby="depenses" className="space-y-2">
        <h2 id="depenses" className="font-semibold text-slate-900">Dépenses encodées</h2>
        {[...byDay].map(([date, rows]) => (
          <div key={date} className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-700">
              <time dateTime={date}>{formatDate(date).replace(/\s+\d{4}$/, '')}</time>
            </h3>
            <CompactRows rows={rows} onOpen={(id) => setPanel({ type: 'spending', id })} />
          </div>
        ))}
        {byDay.size === 0 && <p className="text-sm text-slate-600">Aucune dépense encodée ce mois-ci.</p>}
        <NewSpendingAction showTrigger={byDay.size === 0} />
      </section>

      {panel?.type === 'new-envelope' && <EnvelopeForm onClose={close} />}
      {panel?.type === 'edit-envelope' && envelope && <EnvelopeForm initial={envelope} onClose={close} />}
      {panel?.type === 'envelope' && envelope && (
        <DetailSheet title={envelope.label} onClose={close}
          onEdit={storageBlocked ? undefined : () => setPanel({ type: 'edit-envelope', id: envelope.id })}
          onDelete={storageBlocked ? undefined : () => { state.deleteEnvelope(envelope.id); close(); }}
          deleteLabel="Supprimer cette enveloppe ?">
          <dl className="space-y-2">
            <DetailFact label="Catégorie">{spendingCategoryLabels[envelope.category]}</DetailFact>
            <DetailFact label="Montant mensuel">{formatCurrency(envelope.monthlyAmount)}</DetailFact>
            <DetailFact label="Dépensé en {monthTitle}">{formatCurrency(fromCents(spentInMonth(spendings, envelope.category, month)))}</DetailFact>
          </dl>
        </DetailSheet>
      )}
      {panel?.type === 'edit-spending' && spending && (
        <QuickSpendingSheet initial={spending} onClose={close} onSave={({ amount, category, date, label }) => {
          state.updateSpending(spending.id, { amount, category, date, label });
          close();
        }} />
      )}
      {panel?.type === 'spending' && spending && (
        <DetailSheet title={spendingTitle(spending)} onClose={close}
          onEdit={storageBlocked ? undefined : () => setPanel({ type: 'edit-spending', id: spending.id })}
          onDelete={storageBlocked ? undefined : () => { state.deleteSpending(spending.id); close(); }}
          deleteLabel="Supprimer cette dépense ?">
          <dl className="space-y-2">
            <DetailFact label="Montant">{formatCurrency(spending.amount)}</DetailFact>
            <DetailFact label="Catégorie">{spendingCategoryLabels[spending.category]}</DetailFact>
            <DetailFact label="Date">{formatDate(spending.date)}</DetailFact>
            {spending.balanceIncluded && <DetailFact label="Déjà comprise dans ton solde">Oui</DetailFact>}
          </dl>
        </DetailSheet>
      )}
    </div>
  );
}
