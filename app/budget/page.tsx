'use client';

import Link from 'next/link';
import { Baby, ChevronRight, Calculator, ChartPie, HandCoins, Receipt, ShoppingBasket, Target, Wallet, type LucideIcon } from 'lucide-react';
import { Icon } from '@/components/ui/icons';
import { calculateTotalMonthlyIncome, formatCurrency } from '@/lib/budget-calculations';
import { useApp } from '@/lib/context/AppContext';
import { monthlySpendingTotals } from '@/lib/envelopes';
import { fromCents, toCents } from '@/lib/money';
import { envelopesOf, spendingsOf } from '@/lib/spending';

interface Section {
  href: string;
  label: string;
  icon: LucideIcon;
  detail?: string;
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count > 1 ? many : one}`;
}

function BreakdownSegment({ label, amount, share, className }: {
  label: string; amount: number; share: number; className: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-slate-700">
        <span aria-hidden="true" className={`size-2.5 rounded-full ${className}`} />
        {label}
      </span>
      <span className="tabular-nums font-semibold text-slate-900">
        {formatCurrency(amount)}
        <span className="ml-1 text-xs font-normal text-slate-600">{Math.round(share)} %</span>
      </span>
    </li>
  );
}

function MonthBreakdown() {
  const { incomes, summary } = useApp();
  const certain = calculateTotalMonthlyIncome(incomes.filter((income) => income.isConfirmed));
  const uncertain = calculateTotalMonthlyIncome(incomes.filter((income) => !income.isConfirmed));
  const charges = toCents(summary.totalMonthlyExpenses);
  const debts = toCents(summary.totalMonthlyDebts);
  const envelopes = toCents(summary.totalMonthlyEnvelopes);
  const allocated = charges + debts + envelopes;
  const rest = toCents(certain) - allocated;
  const base = Math.max(toCents(certain), allocated);

  return (
    <section aria-labelledby="repartition" className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <h2 id="repartition" className="text-base font-semibold text-slate-900">Répartition du mois</h2>
      {base <= 0 ? (
        <p className="text-sm text-slate-600">
          Ajoute tes revenus certains et tes charges pour voir comment se répartit un mois.
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-700">
            Revenus certains : <strong className="tabular-nums">{formatCurrency(certain)}</strong> par mois
          </p>
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            <div className="bg-teal-700" style={{ width: `${(charges / base) * 100}%` }} />
            <div className="bg-amber-500" style={{ width: `${(debts / base) * 100}%` }} />
            <div className="bg-indigo-600" style={{ width: `${(envelopes / base) * 100}%` }} />
            {rest > 0 && <div className="bg-green-500" style={{ width: `${(rest / base) * 100}%` }} />}
          </div>
          <ul className="space-y-2">
            <BreakdownSegment label="Charges" amount={fromCents(charges)} share={(charges / base) * 100} className="bg-teal-700" />
            <BreakdownSegment label="Dettes" amount={fromCents(debts)} share={(debts / base) * 100} className="bg-amber-500" />
            <BreakdownSegment label="Enveloppes" amount={fromCents(envelopes)} share={(envelopes / base) * 100} className="bg-indigo-600" />
            {rest >= 0 && (
              <BreakdownSegment label="Reste" amount={fromCents(rest)} share={(rest / base) * 100} className="bg-green-500" />
            )}
          </ul>
          {rest < 0 && (
            <p role="status" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-900">
              Tes charges, dettes et enveloppes dépassent tes revenus certains de {formatCurrency(fromCents(-rest))} par mois.
            </p>
          )}
          <p className="text-xs text-slate-600">
            Moyenne mensuelle : les factures annuelles ou trimestrielles sont réparties sur douze mois.
            {uncertain > 0 && <> {formatCurrency(uncertain)} de revenus incertains ne sont pas comptés.</>}
            {' '}Le vrai disponible, lui, tient compte des dates de chaque paiement.
          </p>
        </>
      )}
    </section>
  );
}

export default function BudgetPage() {
  const state = useApp();
  const { summary, debts, childExpenses, goals, today } = state;
  const monthly = monthlySpendingTotals(spendingsOf(state), envelopesOf(state), today.slice(0, 7));
  const activeDebts = debts.filter((debt) => debt.status !== 'completed');
  const remainingDebt = activeDebts.reduce((sum, debt) => sum + debt.remainingAmount, 0);
  const toRecover = childExpenses
    .filter((expense) => expense.status === 'pending' || expense.status === 'receipt_sent')
    .reduce((sum, expense) => sum + expense.shareAmount, 0);
  const openGoals = goals.filter((goal) => goal.savedAmount < goal.targetAmount).length;

  const sections: Section[] = [
    { href: '/revenus', label: 'Revenus', icon: Wallet, detail: `${formatCurrency(summary.totalMonthlyIncome)}/mois` },
    { href: '/charges', label: 'Charges', icon: Receipt, detail: `${formatCurrency(summary.totalMonthlyExpenses)}/mois` },
    {
      href: '/depenses', label: 'Dépenses du mois', icon: ShoppingBasket,
      detail: `${formatCurrency(fromCents(monthly.spentCents))} dépensés · ${formatCurrency(fromCents(monthly.remainingCents))} restants dans les enveloppes`,
    },
    { href: '/analyse', label: 'Où part mon argent', icon: ChartPie },
    {
      href: '/dettes', label: 'Dettes', icon: HandCoins,
      detail: activeDebts.length > 0
        ? `${formatCurrency(remainingDebt)} restants · ${formatCurrency(summary.totalMonthlyDebts)}/mois`
        : 'Aucune dette',
    },
    {
      href: '/enfants', label: 'Frais des enfants', icon: Baby,
      detail: toRecover > 0 ? `${formatCurrency(toRecover)} à récupérer` : undefined,
    },
    {
      href: '/objectifs', label: 'Objectifs', icon: Target,
      detail: openGoals > 0 ? `${plural(openGoals, 'objectif', 'objectifs')} en cours` : undefined,
    },
    { href: '/simulation', label: 'Simuler un achat', icon: Calculator, detail: 'Puis-je me le permettre ?' },
  ];

  return (
    <div className="space-y-4 px-4 py-4">
      <h1 className="text-xl font-bold text-gray-900">Budget</h1>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-line bg-white">
        {sections.map(({ href, label, icon, detail }) => (
          <li key={href}>
            <Link href={href} className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-teal-50">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-800">
                <Icon icon={icon} className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">{label}</span>
                {detail && <span className="block text-xs tabular-nums text-slate-600">{detail}</span>}
              </span>
              <Icon icon={ChevronRight} className="size-4 shrink-0 text-slate-400" />
            </Link>
          </li>
        ))}
      </ul>
      <MonthBreakdown />
    </div>
  );
}
