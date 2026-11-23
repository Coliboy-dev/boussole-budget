'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Baby, ChevronRight, Calculator, ChartPie, HandCoins, Receipt, ShoppingBasket, Target, Wallet, type LucideIcon } from 'lucide-react';
import { Icon } from '@/components/ui/icons';
import { ChargesDonut, SpendingDonut, surface } from '@/components/budget/BudgetCharts';
import { calculateTotalMonthlyIncome, formatCurrency } from '@/lib/budget-calculations';
import { useApp } from '@/lib/context/AppContext';
import { monthlySpendingTotals } from '@/lib/envelopes';
import { fromCents, toCents } from '@/lib/money';
import { envelopesOf, spendingsOf } from '@/lib/spending';
import { analyzeMonth } from '@/lib/spending-analysis';
import { jointAccountRoutes, useHouseholdMovements } from '@/components/household/HouseholdMovementsContext';

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
      <span className="flex items-center gap-2 text-cap-text">
        <span aria-hidden="true" className={`size-2.5 rounded-full ${className}`} />
        {label}
      </span>
      <span className="tabular-nums font-semibold text-cap-text">
        {formatCurrency(amount)}
        <span className="ml-1 text-xs font-normal text-cap-text-muted">{Math.round(share)} %</span>
      </span>
    </li>
  );
}

function MonthBreakdown() {
  const { incomes, summary, today } = useApp();
  const certain = calculateTotalMonthlyIncome(incomes.filter((income) => income.isConfirmed), today);
  const uncertain = calculateTotalMonthlyIncome(incomes.filter((income) => !income.isConfirmed), today);
  const charges = toCents(summary.totalMonthlyExpenses);
  const debts = toCents(summary.totalMonthlyDebts);
  const envelopes = toCents(summary.totalMonthlyEnvelopes);
  const allocated = charges + debts + envelopes;
  const rest = toCents(certain) - allocated;
  const base = Math.max(toCents(certain), allocated);

  return (
    <section aria-labelledby="repartition" className={`space-y-3 ${surface}`}>
      <h2 id="repartition" className="text-sm font-bold text-cap-text">Répartition du mois</h2>
      {base <= 0 ? (
        <p className="text-sm text-cap-text-muted">
          Ajoute tes revenus certains et tes charges pour voir comment se répartit un mois.
        </p>
      ) : (
        <>
          <p className="text-sm text-cap-text">
            Revenus certains : <strong className="tabular-nums">{formatCurrency(certain)}</strong> par mois
          </p>
          <div className="flex h-3 overflow-hidden rounded-full bg-cap-border" aria-hidden="true">
            <div className="bg-[var(--cap-chart-1)]" style={{ width: `${(charges / base) * 100}%` }} />
            <div className="bg-[var(--cap-chart-3)]" style={{ width: `${(debts / base) * 100}%` }} />
            <div className="bg-[var(--cap-chart-envelope)]" style={{ width: `${(envelopes / base) * 100}%` }} />
            {rest > 0 && <div className="bg-cap-success-text" style={{ width: `${(rest / base) * 100}%` }} />}
          </div>
          <ul className="space-y-2">
            <BreakdownSegment label="Charges" amount={fromCents(charges)} share={(charges / base) * 100} className="bg-[var(--cap-chart-1)]" />
            <BreakdownSegment label="Dettes" amount={fromCents(debts)} share={(debts / base) * 100} className="bg-[var(--cap-chart-3)]" />
            <BreakdownSegment label="Enveloppes" amount={fromCents(envelopes)} share={(envelopes / base) * 100} className="bg-[var(--cap-chart-envelope)]" />
            {rest >= 0 && (
              <BreakdownSegment label="Reste" amount={fromCents(rest)} share={(rest / base) * 100} className="bg-cap-success-text" />
            )}
          </ul>
          {rest < 0 && (
            <p role="status" className="rounded-xl bg-cap-danger-soft p-3 text-sm font-medium text-cap-danger-text">
              Tes charges, dettes et enveloppes dépassent tes revenus certains de {formatCurrency(fromCents(-rest))} par mois.
            </p>
          )}
          <p className="text-xs text-cap-text-muted">
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
  const household = useHouseholdMovements();
  const noJointAccount = !!household && state.hasJointAccount === false;
  const { summary, debts, childExpenses, goals, today } = state;
  const monthly = monthlySpendingTotals(spendingsOf(state), envelopesOf(state), today.slice(0, 7));
  const activeDebts = debts.filter((debt) => debt.status !== 'completed');
  const remainingDebt = activeDebts.reduce((sum, debt) => sum + debt.remainingAmount, 0);
  const toRecover = childExpenses
    .filter((expense) => expense.status === 'pending' || expense.status === 'receipt_sent')
    .reduce((sum, expense) => sum + expense.shareAmount, 0);
  const openGoals = goals.filter((goal) => goal.savedAmount < goal.targetAmount).length;
  // Vue du quotidien par défaut : les dépenses du mois. Sans compte commun, le foyer n'a pas de charges.
  const [view, setView] = useState<'spending' | 'charges'>('spending');
  const shown = noJointAccount ? 'spending' : view;
  const analysis = analyzeMonth(state, today.slice(0, 7));

  const sections: Section[] = [
    // Le quotidien d'abord, puis ce qui se règle une fois pour longtemps.
    {
      href: '/depenses', label: 'Dépenses du mois', icon: ShoppingBasket,
      detail: `${formatCurrency(fromCents(monthly.spentCents))} dépensés · ${formatCurrency(fromCents(monthly.remainingCents))} restants dans les enveloppes`,
    },
    { href: '/analyse', label: 'Où part mon argent', icon: ChartPie },
    { href: '/charges', label: 'Charges', icon: Receipt, detail: `${formatCurrency(summary.totalMonthlyExpenses)}/mois` },
    { href: '/revenus', label: 'Revenus', icon: Wallet, detail: `${formatCurrency(summary.totalMonthlyIncome)}/mois` },
    {
      href: '/dettes', label: 'Dettes', icon: HandCoins,
      detail: activeDebts.length > 0
        ? `${formatCurrency(remainingDebt)} restants · ${formatCurrency(summary.totalMonthlyDebts)}/mois`
        : 'Aucune dette',
    },
    {
      href: '/enfants', label: 'Frais à partager', icon: Baby,
      detail: toRecover > 0 ? `${formatCurrency(toRecover)} à récupérer` : 'Frais d’enfants remboursés par l’autre parent',
    },
    {
      href: '/objectifs', label: 'Objectifs', icon: Target,
      detail: openGoals > 0 ? `${plural(openGoals, 'objectif', 'objectifs')} en cours` : undefined,
    },
    { href: '/simulation', label: 'Simuler un achat', icon: Calculator, detail: 'Puis-je me le permettre ?' },
  ];

  return (
    <div className="space-y-4 px-4 py-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-cap-text">Mon budget</h1>
        <p className="text-sm text-cap-text-muted">Tes dépenses du quotidien, tes charges et tes objectifs.</p>
      </header>
      {!noJointAccount && (
        <div role="group" aria-label="Vue" className="grid grid-cols-2 gap-1 rounded-2xl bg-cap-surface-soft p-1">
          {([['spending', 'Dépenses du mois'], ['charges', 'Charges']] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)}
              className="min-h-11 rounded-xl px-3 text-sm font-semibold text-cap-text-muted aria-pressed:bg-cap-surface aria-pressed:text-cap-primary-text aria-pressed:shadow-sm">
              {label}
            </button>
          ))}
        </div>
      )}
      {shown === 'spending' && <SpendingDonut analysis={analysis} links />}
      {shown === 'charges' && <ChargesDonut links />}
      {shown === 'charges' && <MonthBreakdown />}
      <ul className="divide-y divide-cap-border overflow-hidden rounded-[19px] border border-cap-border bg-cap-surface">
        {sections.filter(({ href }) => !noJointAccount || !jointAccountRoutes.has(href)).map(({ href, label, icon, detail }) => (
          <li key={href}>
            <Link href={href} className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-cap-surface-soft">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cap-surface-soft text-cap-primary-text">
                <Icon icon={icon} className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-cap-text">{label}</span>
                {detail && <span className="block text-xs tabular-nums text-cap-text-muted">{detail}</span>}
              </span>
              <Icon icon={ChevronRight} className="size-4 shrink-0 text-cap-text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
