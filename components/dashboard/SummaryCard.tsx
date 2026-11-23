import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { formatCurrency, formatDate, formatShortDate } from '@/lib/budget-calculations';
import { householdCopy } from '@/lib/household-copy';
import type { BudgetSummary } from '@/lib/types';
import { RiskChip } from '@/components/projection/ProjectionTimeline';
import { Icon } from '@/components/ui/icons';

interface SummaryCardProps {
  summary: BudgetSummary;
  hasUndatedPayments: boolean;
  hasRecordedBalance?: boolean;
  inHousehold?: boolean;
  /** Réglages affichés sous le chiffre (solde, réserve). */
  children?: ReactNode;
  /** Détail du calcul ouvert d'emblée (premier budget). */
  explainOpen?: boolean;
  /** Date du solde recopié de la banque : le chiffre en dépend (pas de connexion bancaire). */
  balanceDate?: string;
}

/** Une ligne de l'escalier : « − Réserve de sécurité … 50,00 € ». Les montants se lisent avec leur signe. */
function Step({ label, amount, sign, detail, total = false }: {
  label: string; amount: number; sign?: '+' | '−'; detail?: string; total?: boolean;
}) {
  const shown = total && amount < 0 ? `−${formatCurrency(-amount)}` : `${sign ?? ''}${sign ? ' ' : ''}${formatCurrency(amount)}`;
  return (
    <div className={total ? 'mt-1 border-t border-white/25 pt-1.5 font-semibold text-white' : ''}>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="min-w-0">{label}</dt>
        <dd className="shrink-0 tabular-nums">{shown}</dd>
      </div>
      {detail && <p className="text-xs text-white/75">{detail}</p>}
    </div>
  );
}

/**
 * Carte du vrai disponible (Élan V3) : fond teal profond, chiffre en blanc.
 * Le statut est toujours écrit ; un budget vide n'en affiche aucun.
 */
export default function SummaryCard({
  summary, hasUndatedPayments, hasRecordedBalance = false, inHousehold = false, children, explainOpen = false, balanceDate,
}: SummaryCardProps) {
  const empty = summary.emptyBudget && !hasRecordedBalance;
  const forecast = summary.availableForecast;
  const end = forecast.dailyBalances.at(-1);
  const causes = forecast.causes.slice(0, 2).join(', ');
  const steps = forecast.breakdown;
  const negative = summary.trueAvailable < 0;
  const lowestDay = steps.lowestDate === forecast.dailyBalances[0]?.date ? 'aujourd’hui' : `le ${formatShortDate(steps.lowestDate)}`;
  // L'épargne « gardée sur le compte courant » fait partie du solde : elle ne peut pas le dépasser.
  const savedOnAccount = forecast.goalSavings - forecast.goalThisMonth;
  const savingsAboveBalance = savedOnAccount > 0 && savedOnAccount > summary.currentBalance;

  return (
    <section className="overflow-hidden rounded-[22px] border border-cap-border bg-cap-surface shadow-[0_1px_2px_rgba(23,44,55,0.04)]">
      <div className="relative space-y-3 overflow-hidden bg-cap-primary-strong p-5 text-white">
        <span aria-hidden="true" className="pointer-events-none absolute -right-12 -bottom-16 size-48 rounded-full bg-white/8" />
        <span aria-hidden="true" className="pointer-events-none absolute -right-2 -top-10 size-28 rounded-full bg-white/6" />
        <div className="relative">
          <h2 className="text-sm font-semibold text-white/90">{inHousehold ? householdCopy.confirmedAvailable : 'Vrai disponible'}</h2>
          <p className="mt-1 font-display text-4xl font-extrabold leading-tight tracking-tight tabular-nums wrap-anywhere sm:text-5xl">
            {formatCurrency(summary.trueAvailable)}
          </p>
          {end && !empty && (
            // La définition, toujours sous le chiffre : on vient d'une banque qui ne montre que le solde.
            <p className="mt-1 text-sm font-medium text-white/90">
              {negative ? (
                <>Il te manque <strong className="text-white">{formatCurrency(-summary.trueAvailable)}</strong> pour couvrir tout ce qui est prévu
                  jusqu’au <time dateTime={end.date}>{formatDate(end.date)}</time>.</>
              ) : (
                <>Ce que tu peux dépenser jusqu’au <time dateTime={end.date}>{formatDate(end.date)}</time> en couvrant tes paiements prévus.</>
              )}
            </p>
          )}
          {(!summary.emptyBudget || hasUndatedPayments) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {!summary.emptyBudget && <RiskChip risk={summary.riskLevel} />}
              {hasUndatedPayments && (
                <span className="inline-flex items-center gap-1 rounded-full bg-cap-warning-soft px-2 py-0.5 text-xs font-semibold text-cap-warning-text">
                  <Icon icon={TriangleAlert} className="size-3.5" />
                  Projection partielle
                </span>
              )}
            </div>
          )}
        </div>
        {summary.emptyBudget ? (
          <p className="relative text-sm text-white/90">
            {hasRecordedBalance ? 'Aucune échéance saisie pour l’instant.' : 'Saisis ton solde et tes échéances pour obtenir la projection.'}
          </p>
        ) : (
          <details open={explainOpen} className="relative rounded-xl bg-white/10 px-3 py-2 text-sm text-white/90">
            <summary className="min-h-8 cursor-pointer font-semibold text-white focus-visible:outline-white">Comment c’est calculé</summary>
            <dl className="mt-2 space-y-1.5">
              <Step label="Ton solde aujourd’hui" amount={steps.balance} />
              {steps.incomes > 0 && <Step label={`Revenus certains d’ici ${lowestDay}`} amount={steps.incomes} sign="+" />}
              {steps.charges > 0 && (
                <Step label={`Charges et mensualités d’ici ${lowestDay}`} amount={steps.charges} sign="−" detail={causes ? `dont ${causes}` : undefined} />
              )}
              {steps.envelopes > 0 && <Step label="Enveloppes (dépenses du quotidien)" amount={steps.envelopes} sign="−" />}
              {steps.savingsTransfers > 0 && <Step label="Virements vers ton épargne" amount={steps.savingsTransfers} sign="−" />}
              {/* Sous-total seulement s'il y a des mouvements : sinon il répète le solde. */}
              {steps.incomes + steps.charges + steps.envelopes + steps.savingsTransfers > 0 && (
                <Step total label={`Ce qui te reste au plus bas, ${lowestDay}`} amount={steps.lowest} />
              )}
              <Step label="Réserve de sécurité" amount={steps.safetyReserve} sign="−" />
              {steps.annualProvision > 0 && <Step label="Provisions pour charges annuelles" amount={steps.annualProvision} sign="−" />}
              {steps.goalSavings > 0 && (
                <Step label="Épargne pour tes objectifs" amount={steps.goalSavings} sign="−"
                  detail={forecast.goalThisMonth > 0
                    ? `${formatCurrency(steps.goalSavings - forecast.goalThisMonth)} déjà épargnés + ${formatCurrency(forecast.goalThisMonth)} à mettre de côté ce mois-ci`
                    : undefined} />
              )}
              <Step total label={negative ? 'Il te manque' : 'Tu peux dépenser'} amount={Math.abs(steps.available)} />
            </dl>
            <p className="mt-2 text-xs text-white/75">
              {/* Capiste n'est pas relié à la banque : le chiffre vaut ce que valent le solde et les données encodées. */}
              D’après {balanceDate ? <>ton solde du <time dateTime={balanceDate}>{formatShortDate(balanceDate)}</time></> : 'ton solde'} et
              ce que tu as encodé. Calculé au jour le plus serré de la période ; les revenus incertains ne sont pas comptés.
            </p>
          </details>
        )}
        {savingsAboveBalance && (
          <p role="note" className="relative flex gap-2 rounded-xl bg-white/12 px-3 py-2 text-sm text-white">
            <Icon icon={TriangleAlert} className="mt-0.5 size-4 shrink-0" />
            <span>
              Ton solde ({formatCurrency(summary.currentBalance)}) est plus bas que l’épargne que tu dis garder sur ton compte courant
              ({formatCurrency(savedOnAccount)}). Vérifie ton solde, ou indique dans Objectifs que cette épargne est sur un compte à part.
            </span>
          </p>
        )}
        {inHousehold && (!summary.emptyBudget || hasRecordedBalance) && (
          <div className="relative rounded-xl bg-white/12 px-3 py-2 text-sm">
            <p className="text-white/90">{householdCopy.expectedAvailable}</p>
            <p className="font-bold tabular-nums">{formatCurrency(forecast.optimisticAvailable)}</p>
          </div>
        )}
        {!inHousehold && forecast.optimisticAvailable > summary.trueAvailable && (
          <details className="relative text-sm text-white/90">
            <summary className="cursor-pointer font-medium focus-visible:outline-white">Si les revenus incertains arrivent</summary>
            <p className="mt-2">Vrai disponible estimé à <strong className="text-white">{formatCurrency(forecast.optimisticAvailable)}</strong>.</p>
          </details>
        )}
      </div>
      {children && <div className="bg-cap-surface">{children}</div>}
    </section>
  );
}
