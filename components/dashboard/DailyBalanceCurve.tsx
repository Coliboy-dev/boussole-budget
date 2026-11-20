'use client';

import { useState } from 'react';
import Card from '@/components/ui/Card';
import { formatCurrency, formatDate, formatShortDate } from '@/lib/budget-calculations';
import type { DailyBalance } from '@/lib/types';

interface DailyBalanceCurveProps {
  points: DailyBalance[];
  lowestDate: string;
  reserve: number;
  includesAnnualProvision?: boolean;
}

export default function DailyBalanceCurve({ points, lowestDate, reserve, includesAnnualProvision }: DailyBalanceCurveProps) {
  const [selectedDay, setSelectedDay] = useState<number>();
  if (points.length === 0) return null;

  const lastIndex = points.length - 1;
  const balances = points.map(({ balance }) => balance);
  const minimum = Math.min(reserve, ...balances);
  const maximum = Math.max(reserve, ...balances);
  const padding = Math.max((maximum - minimum) * 0.1, 1);
  const scale = maximum - minimum + 2 * padding;
  const x = (index: number) => 10 + (index / Math.max(lastIndex, 1)) * 340;
  const y = (balance: number) => 116 - ((balance - minimum + padding) / scale) * 104;
  const pointList = points.map(({ balance }, index) => `${x(index)},${y(balance)}`).join(' ');
  const defaultDay = Math.max(points.findIndex(({ date }) => date === lowestDate), 0);
  const day = Math.min(selectedDay ?? defaultDay, lastIndex);
  const point = points[day];
  const reserveLineY = y(reserve);
  const selectedX = x(day);
  const selectedY = y(point.balance);
  const reserveLabel = includesAnnualProvision ? 'Réserve et provisions' : 'Réserve de sécurité';

  return (
    <Card className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-gray-900">Courbe du solde</h2>
        <p className="text-xs text-gray-600">Solde prudent en fin de journée.</p>
      </div>
      <figure>
        <svg
          viewBox="0 0 360 128"
          className="block w-full"
          role="img"
          aria-label={`Évolution du solde prudent, ${reserveLabel.toLowerCase()}`}
        >
          <line x1="10" x2="350" y1="116" y2="116" className="stroke-gray-200" />
          <line x1="10" x2="350" y1={reserveLineY} y2={reserveLineY} strokeDasharray="5 4" className="stroke-amber-800" />
          <line x1={selectedX} x2={selectedX} y1="12" y2="116" className="stroke-gray-300" />
          <polyline points={pointList} fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-teal-700" />
          <circle cx={selectedX} cy={selectedY} r="4" strokeWidth="2" className="fill-white stroke-teal-800" />
        </svg>
        <figcaption className="space-y-2 text-xs text-gray-600">
          <div className="flex justify-between">
            <time dateTime={points[0].date}>{formatShortDate(points[0].date)}</time>
            <time dateTime={points[lastIndex].date}>{formatShortDate(points[lastIndex].date)}</time>
          </div>
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block w-5 border-t border-dashed border-amber-800" />
            {reserveLabel} {formatCurrency(reserve)}
          </div>
        </figcaption>
      </figure>
      <div className="space-y-1 border-t border-gray-100 pt-2">
        <label className="block text-xs font-medium text-gray-700" htmlFor="daily-balance-day">Choisir une date</label>
        <input
          id="daily-balance-day"
          type="range"
          min="0"
          max={lastIndex}
          step="1"
          value={day}
          onChange={(event) => setSelectedDay(Number(event.target.value))}
          aria-valuetext={`${formatDate(point.date)}, ${formatCurrency(point.balance)}`}
          className="block w-full accent-teal-700"
        />
        <p className="flex flex-wrap justify-between gap-x-3 text-sm text-gray-800">
          <time dateTime={point.date}>{formatDate(point.date)}</time>
          <strong className="tabular-nums">{formatCurrency(point.balance)}</strong>
        </p>
      </div>
    </Card>
  );
}
