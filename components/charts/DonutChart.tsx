import { formatCurrency } from '@/lib/budget-calculations';
import type { ChartPart } from '@/lib/chart-parts';
import { fromCents } from '@/lib/money';
import { categoryColors, otherColor } from './palette';

const percent = new Intl.NumberFormat('fr-BE', { style: 'percent', maximumFractionDigits: 0 });
const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Anneau de répartition (Élan V3). Le périmètre est écrit en titre, chaque part a son libellé, son montant
 * et sa part en toutes lettres : la couleur n'est jamais seule à porter l'information.
 */
export default function DonutChart({ title, scope, parts, totalCents, totalLabel }: {
  title: string;
  /** Ce que mesure le graphique, en toutes lettres (« Charges programmées… », « Dépenses enregistrées… »). */
  scope: string;
  parts: ChartPart[];
  totalCents: number;
  totalLabel: string;
}) {
  // Début de chaque segment sur le cercle, calculé avant le rendu.
  const starts = parts.map((_, index) => parts.slice(0, index).reduce((sum, { share }) => sum + share * CIRCUMFERENCE, 0));
  // Couleur par position, dans l'ordre fixe ; « Autres » toujours en gris.
  const colors = parts.map(({ other }, index) => (other ? otherColor : categoryColors[index % categoryColors.length]));
  // Fin liseré de la couleur du fond entre deux parts (environ 2 px).
  const gap = parts.length > 1 ? 1.4 : 0;
  const summary = parts.map(({ label, cents, share }) => `${label} ${formatCurrency(fromCents(cents))} (${percent.format(share)})`).join(', ');

  return (
    <figure className="space-y-3">
      <figcaption className="space-y-0.5">
        <span className="block text-sm font-bold text-cap-text">{title}</span>
        <span className="block text-xs text-cap-text-muted">{scope}</span>
      </figcaption>
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative mx-auto size-36 shrink-0 sm:mx-0">
          <svg viewBox="0 0 100 100" className="size-full -rotate-90" role="img"
            aria-label={`${title}. ${scope}. Total ${formatCurrency(fromCents(totalCents))}. ${summary}.`}>
            <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="var(--cap-border)" strokeWidth="14" />
            {parts.map(({ label, share }, index) => {
              const length = Math.max(share * CIRCUMFERENCE - gap, 0.01);
              return (
                <circle key={label} cx="50" cy="50" r={RADIUS} fill="none" stroke={colors[index]} strokeWidth="14"
                  strokeDasharray={`${length} ${CIRCUMFERENCE - length}`} strokeDashoffset={-starts[index]} />
              );
            })}
          </svg>
          <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="font-display text-base font-extrabold tabular-nums text-cap-text">{formatCurrency(fromCents(totalCents))}</span>
            <span className="text-[11px] text-cap-text-muted">{totalLabel}</span>
          </div>
        </div>
        {/* Sur téléphone, la légende passe sous l’anneau plutôt que de comprimer les libellés. */}
        <ul className="min-w-60 flex-1 basis-60 space-y-1.5 text-sm">
          {parts.map(({ label, cents, share }, index) => (
            <li key={label} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 text-cap-text">
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: colors[index] }} />
                <span className="wrap-break-word">{label}</span>
              </span>
              <span className="shrink-0 text-right tabular-nums">
                <span className="font-semibold text-cap-text">{formatCurrency(fromCents(cents))}</span>
                <span className="ml-1 text-xs text-cap-text-muted">{percent.format(share)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
