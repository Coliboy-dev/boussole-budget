'use client';

import { useId, useState } from 'react';
import { formatCurrency, formatDate, formatShortDate } from '@/lib/budget-calculations';
import type { DailyBalance } from '@/lib/types';

interface Props {
  points: DailyBalance[];
  lowestDate: string;
  lowestBalance: number;
  reserve: number;
  includesAnnualProvision: boolean;
}

// Dimensions du dessin (unités SVG). La courbe est en escalier : le solde change le jour d’une échéance, pas entre deux.
const W = 360;
const H = 152;
const LEFT = 8;
const RIGHT = 352;
const TOP = 16;
const BOTTOM = 148;

/**
 * Courbe du solde prudent (revenus incertains exclus), calculée par le moteur.
 * Aucune valeur n’est lissée ni estimée ici : chaque palier est un solde de fin de journée.
 */
export default function ProjectionCurve({ points, lowestDate, lowestBalance, reserve, includesAnnualProvision }: Props) {
  const gradientId = useId();
  const [selected, setSelected] = useState<number>();
  if (points.length === 0) return null;

  const last = points.length - 1;
  const balances = points.map(({ balance }) => balance);
  const showZero = Math.min(...balances) < 0;
  // L’échelle inclut toujours la réserve, et zéro dès que le solde passe en négatif.
  const low = Math.min(reserve, ...balances);
  const high = Math.max(reserve, ...balances);
  const pad = Math.max((high - low) * 0.12, 1);
  const min = low - pad;
  const max = high + pad;
  const x = (index: number) => LEFT + (index / Math.max(last, 1)) * (RIGHT - LEFT);
  const y = (balance: number) => BOTTOM - ((balance - min) / (max - min)) * (BOTTOM - TOP);

  let line = `M${x(0)},${y(points[0].balance)}`;
  for (let index = 1; index <= last; index++) {
    line += ` H${x(index)} V${y(points[index].balance)}`;
  }
  const area = `${line} V${BOTTOM} H${x(0)} Z`;

  const lowestIndex = Math.max(points.findIndex(({ date }) => date === lowestDate), 0);
  const day = Math.min(selected ?? lowestIndex, last);
  const point = points[day];
  const reserveY = y(reserve);
  const zeroY = y(0);
  const reserveLabel = includesAnnualProvision ? 'Réserve et provisions' : 'Réserve de sécurité';
  const markerAbove = y(lowestBalance) > TOP + 28;

  return (
    <figure className="space-y-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img"
        aria-label={`Solde prudent du ${formatDate(points[0].date)} au ${formatDate(points[last].date)}. Point bas ${formatCurrency(lowestBalance)} le ${formatDate(lowestDate)}. ${reserveLabel} : ${formatCurrency(reserve)}.`}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--cap-primary)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--cap-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={LEFT} x2={RIGHT} y1={BOTTOM} y2={BOTTOM} stroke="var(--cap-border)" />
        {showZero && (
          <line x1={LEFT} x2={RIGHT} y1={zeroY} y2={zeroY} stroke="var(--cap-danger-text)" strokeWidth="1" />
        )}
        <line x1={LEFT} x2={RIGHT} y1={reserveY} y2={reserveY} stroke="var(--cap-warning-text)" strokeDasharray="5 4" />
        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke="var(--cap-primary)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <line x1={x(day)} x2={x(day)} y1={TOP - 6} y2={BOTTOM} stroke="var(--cap-border-strong)" strokeDasharray="2 3" />
        <circle cx={x(lowestIndex)} cy={y(lowestBalance)} r="5" fill="var(--cap-surface)" stroke="var(--cap-primary-strong)" strokeWidth="2.5" />
        <text x={Math.min(Math.max(x(lowestIndex), LEFT + 30), RIGHT - 30)} y={markerAbove ? y(lowestBalance) - 10 : y(lowestBalance) + 18}
          textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--cap-text)">
          Point bas
        </text>
        <circle cx={x(day)} cy={y(point.balance)} r="4" fill="var(--cap-primary-strong)" />
      </svg>
      <figcaption className="space-y-2 text-xs text-cap-text-muted">
        <div className="flex justify-between">
          <time dateTime={points[0].date}>{formatShortDate(points[0].date)}</time>
          <time dateTime={points[last].date}>{formatShortDate(points[last].date)}</time>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-0.5 w-5 rounded bg-cap-primary" />
            Solde prudent (revenus incertains exclus)
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block w-5 border-t border-dashed border-cap-warning-text" />
            {reserveLabel} {formatCurrency(reserve)}
          </li>
          {showZero && (
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block h-px w-5 bg-cap-danger-text" />
              Zéro euro
            </li>
          )}
        </ul>
      </figcaption>
      <div className="space-y-1 border-t border-cap-border pt-3">
        <label className="block text-xs font-medium text-cap-text-muted" htmlFor="projection-day">Choisir une date</label>
        <input id="projection-day" type="range" min="0" max={last} step="1" value={day}
          onChange={(event) => setSelected(Number(event.target.value))}
          aria-valuetext={`${formatDate(point.date)}, ${formatCurrency(point.balance)}`}
          className="block w-full accent-[var(--cap-primary)]" />
        <p className="flex flex-wrap justify-between gap-x-3 text-sm text-cap-text">
          <time dateTime={point.date}>{formatDate(point.date)}</time>
          <strong className="tabular-nums">{formatCurrency(point.balance)}</strong>
        </p>
      </div>
    </figure>
  );
}
