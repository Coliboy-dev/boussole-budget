'use client';

import Link from 'next/link';
import { useState } from 'react';
import Card from '@/components/ui/Card';
import FormField from '@/components/forms/FormField';
import { calculateSharedExpenseStatement, formatCurrency, formatDate, formatShortDate } from '@/lib/budget-calculations';
import { useApp } from '@/lib/context/AppContext';
import { startOfQuarter } from '@/lib/local-date';
import type { ChildExpenseStatus } from '@/lib/types';
import './statement.css';

const statusLabels: Record<ChildExpenseStatus, string> = {
  paid: 'Payé',
  pending: 'En attente de remboursement',
  reimbursed: 'Remboursé',
  receipt_sent: 'Justificatif envoyé',
};

function quarterLabel(start: string) {
  const quarter = Math.ceil(Number(start.slice(5, 7)) / 3);
  return `${quarter === 1 ? '1er' : `${quarter}e`} trimestre ${start.slice(0, 4)}`;
}

function ExpenseAmounts({ totalAmount, paidByUser, shareAmount }: {
  totalAmount: number;
  paidByUser: number;
  shareAmount: number;
}) {
  return (
    <dl className="grid grid-cols-3 gap-2">
      <div className="min-w-0">
        <dt className="text-xs text-gray-600">Montant total</dt>
        <dd className="wrap-anywhere font-semibold tabular-nums">{formatCurrency(totalAmount)}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-xs text-gray-600">Montant avancé</dt>
        <dd className="wrap-anywhere font-semibold tabular-nums">{formatCurrency(paidByUser)}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-xs text-gray-600">Part saisie</dt>
        <dd className="wrap-anywhere font-semibold tabular-nums">{formatCurrency(shareAmount)}</dd>
      </div>
    </dl>
  );
}

export default function ChildExpenseStatementPage() {
  const { childExpenses, isBudgetLoading, today } = useApp();
  const [selectedQuarter, setSelectedQuarter] = useState<string>();

  if (isBudgetLoading) {
    return <p role="status" className="px-4 py-6 text-sm text-gray-600">Chargement des frais…</p>;
  }

  const currentQuarter = startOfQuarter(today);
  const quarter = selectedQuarter ?? currentQuarter;
  const quarters = [...new Set([
    currentQuarter,
    quarter,
    ...childExpenses.filter(({ shareAmount }) => shareAmount > 0).map(({ date }) => startOfQuarter(date)),
  ])].sort().reverse();
  const statement = calculateSharedExpenseStatement(childExpenses, quarter);

  return (
    <div data-expense-statement className="space-y-4 px-4 py-4 print:space-y-0 print:p-0">
      <div className="space-y-4 print:hidden">
        <Link href="/enfants" className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-800 underline">
          Retour aux frais enfants
        </Link>
        <Card>
          <FormField label="Trimestre">
            <select
              value={quarter}
              onChange={(event) => setSelectedQuarter(event.target.value)}
              className="w-full rounded-xl border border-gray-400 bg-white px-3 py-2 text-sm"
            >
              {quarters.map((start) => <option key={start} value={start}>{quarterLabel(start)}</option>)}
            </select>
          </FormField>
          {statement.items.length > 0 && (
            <button
              type="button"
              className="min-h-11 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
              onClick={() => window.print()}
            >
              Imprimer ou enregistrer en PDF
            </button>
          )}
        </Card>
      </div>

      <article className="space-y-4 text-gray-900">
        <header className="space-y-2">
          <p className="text-xs font-semibold text-teal-800 print:text-black">Brouillon pour relecture</p>
          <h1 className="text-xl font-bold">Relevé trimestriel des frais partagés</h1>
          <p className="text-sm text-gray-700">
            Du <time dateTime={statement.start}>{formatDate(statement.start)}</time>
            {' au '}<time dateTime={statement.end}>{formatDate(statement.end)}</time>
          </p>
          <p className="text-sm text-gray-700">Préparé le <time dateTime={today}>{formatDate(today)}</time>.</p>
          <p className="text-sm text-gray-700">Le relevé reprend tes saisies. Fais-le valider avant de le transmettre.</p>
        </header>

        {statement.items.length === 0 ? (
          <p className="text-sm text-gray-700">Aucun frais avec une part enregistrée pour ce trimestre.</p>
        ) : (
          <>
            <div className="space-y-2 rounded-2xl border border-teal-200 bg-teal-50 p-4 print:break-inside-avoid print:bg-white">
              <h2 className="text-sm font-semibold">Totaux du trimestre</h2>
              <ExpenseAmounts
                totalAmount={statement.totalAmount}
                paidByUser={statement.paidByUser}
                shareAmount={statement.shareAmount}
              />
            </div>

            <section aria-labelledby="statement-items">
              <h2 id="statement-items" className="mb-2 text-sm font-semibold">Frais du trimestre</h2>
              <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white px-4 print:rounded-none print:border-0 print:px-0">
                {statement.items.map((expense) => (
                  <li key={expense.id} className="space-y-2 py-3 print:break-inside-avoid">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <h3 className="min-w-0 wrap-anywhere text-sm font-semibold">{expense.label}</h3>
                      <time dateTime={expense.date} className="text-xs text-gray-600">
                        {formatShortDate(expense.date)}
                      </time>
                    </div>
                    <ExpenseAmounts
                      totalAmount={expense.totalAmount}
                      paidByUser={expense.paidByUser}
                      shareAmount={expense.shareAmount}
                    />
                    <p className="text-xs text-gray-700">{statusLabels[expense.status]}</p>
                    <p className="wrap-anywhere text-xs text-gray-700">
                      {expense.receiptReference?.trim()
                        ? `Réf. du justificatif ${expense.receiptReference.trim()}`
                        : 'Référence du justificatif à renseigner'}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </article>
    </div>
  );
}
