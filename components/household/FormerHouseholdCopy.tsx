'use client';

import { useState } from 'react';
import Card from '@/components/ui/Card';
import { formatCurrency, formatShortDate } from '@/lib/budget-calculations';
import type { AppState } from '@/lib/budget-state';
import { householdCopy, householdMessages } from '@/lib/household-copy';
import { exportHouseholdCopy } from '@/lib/household-copy-export';
import { materializeHousehold } from '@/lib/household-materialize';
import { eraseFormerHouseholdCopy, readFormerHouseholdCopy, type HouseholdDirectory } from '@/lib/household-storage';
import { decodeHouseholdView } from '@/lib/household-sync';
import { spendingCategoryLabels } from '@/lib/spending';

const secondary = 'inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 disabled:opacity-50';
const danger = 'inline-flex min-h-11 items-center rounded-xl border border-rose-300 bg-white px-4 text-sm font-semibold text-rose-800 disabled:opacity-50';

type Copy = { budget: AppState; unreadable: number };

/**
 * Copie en lecture seule d'un ancien foyer. Tout se passe sur l'appareil : déchiffrement en mémoire avec la clé
 * locale non extractible, aucune requête réseau, aucune synchronisation. Rien n'est modifié dans le budget personnel.
 */
export default function FormerHouseholdCopy({ userId, householdId, leftAt, onErased }: {
  userId: string; householdId: string; leftAt: string; onErased: (directory: HouseholdDirectory) => void;
}) {
  const [copy, setCopy] = useState<Copy | null>();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const leftOn = formatShortDate(leftAt.slice(0, 10));

  async function open() {
    setError('');
    try {
      const stored = await readFormerHouseholdCopy(userId, householdId);
      if (!stored) {
        setCopy(null);
        return;
      }
      let unreadable = 0;
      const rows = await decodeHouseholdView(stored.key, householdId, stored, (count) => { unreadable = count; });
      setCopy({ budget: materializeHousehold(rows), unreadable });
    } catch {
      setError(householdCopy.copyUnavailable);
    }
  }

  function download(budget: AppState) {
    const exportedAt = new Date().toISOString();
    const url = URL.createObjectURL(new Blob([exportHouseholdCopy(budget, leftAt, exportedAt)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `capiste-copie-foyer-${exportedAt.slice(0, 10)}.json`;
    document.body.append(link);
    try {
      link.click();
    } finally {
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  async function erase() {
    setBusy(true);
    setError('');
    try {
      onErased(await eraseFormerHouseholdCopy(userId, householdId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : householdCopy.copyUnavailable);
      setBusy(false);
    }
  }

  const budget = copy?.budget;
  const spendings = budget?.spendings ?? [];

  return (
    <Card className="space-y-3 text-sm">
      <p role="status" className="font-semibold text-slate-900">{householdCopy.sharingDisabled}</p>
      <p className="text-slate-700">{householdMessages.formerHouseholdSince(leftOn)}</p>
      <p className="text-slate-700">{householdCopy.localCopyKept}</p>

      {copy === undefined && (
        <button type="button" className={secondary} onClick={() => { void open(); }}>{householdCopy.copyOpen}</button>
      )}
      {copy === null && <p className="text-slate-700">{householdCopy.copyMissing}</p>}

      {budget && (
        <section aria-label={householdMessages.copyTitle(leftOn)} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <h3 className="font-semibold text-slate-900">{householdMessages.copyTitle(leftOn)}</h3>
          {copy.unreadable > 0 && <p className="text-amber-900">{householdCopy.unreadableItems}</p>}
          {budget.balanceDate && (
            <p className="text-slate-900">
              {householdCopy.copyBalance} <strong className="tabular-nums">{formatCurrency(budget.currentBalance)}</strong>
              {' '}({householdMessages.copyBalanceDate(formatShortDate(budget.balanceDate))})
            </p>
          )}
          <CopyList title={householdCopy.copyIncomes} rows={budget.incomes.map((income) => [income.label, income.amount, undefined])} />
          <CopyList title={householdCopy.copyExpenses} rows={budget.expenses.map((expense) => [expense.label, expense.amount, expense.dueDate])} />
          <CopyList title={householdCopy.copySpendings} rows={spendings.map((spending) => [
            spending.label ?? (spending.category === 'household' ? householdCopy.transfers : spendingCategoryLabels[spending.category]),
            spending.amount, spending.date,
          ])} />
          {budget.incomes.length + budget.expenses.length + spendings.length === 0 && (
            <p className="text-slate-700">{householdCopy.copyEmpty}</p>
          )}
          <p className="text-slate-700">{householdCopy.copyExportWarning}</p>
          <button type="button" className={secondary} onClick={() => download(budget)}>{householdCopy.copyDownload}</button>
        </section>
      )}

      {confirming ? (
        <div role="group" aria-labelledby={`erase-${householdId}`} className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
          <p id={`erase-${householdId}`} className="font-semibold text-slate-900">{householdCopy.copyEraseQuestion}</p>
          <p className="text-slate-700">{householdCopy.copyErasePersonalSafe}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={danger} disabled={busy} onClick={() => { void erase(); }}>{householdCopy.copyEraseConfirm}</button>
            <button type="button" className={secondary} disabled={busy} onClick={() => setConfirming(false)}>{householdCopy.cancel}</button>
          </div>
        </div>
      ) : (
        <button type="button" className={danger} onClick={() => setConfirming(true)}>{householdCopy.copyErase}</button>
      )}
      {error && <p role="alert" className="text-rose-800">{error}</p>}
    </Card>
  );
}

function CopyList({ title, rows }: { title: string; rows: [string, number, string | undefined][] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h4 className="font-semibold text-slate-900">{title}</h4>
      <ul className="divide-y divide-slate-200">
        {rows.map(([label, amount, date], index) => (
          <li key={index} className="flex flex-wrap justify-between gap-x-3 py-1.5">
            <span className="min-w-0 text-slate-900">
              {label}
              {date && <span className="text-slate-600"> · <time dateTime={date}>{formatShortDate(date)}</time></span>}
            </span>
            <span className="tabular-nums text-slate-900">{formatCurrency(amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
