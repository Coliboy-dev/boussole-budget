'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonths, parseLocalDate } from '@/lib/local-date';
import { Icon } from '@/components/ui/icons';

const monthFormatter = new Intl.DateTimeFormat('fr-BE', { month: 'long', year: 'numeric' });
const monthButton = 'flex size-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 text-teal-800 hover:bg-teal-50 disabled:opacity-50';

export function formatSpendingMonth(month: string): string {
  return monthFormatter.format(parseLocalDate(`${month}-01`));
}

export default function SpendingMonthSelector({ month, currentMonth, onChange }: {
  month: string;
  currentMonth: string;
  onChange: (month: string) => void;
}) {
  const firstDay = `${month}-01`;
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-white p-2">
      <button type="button" aria-label="Mois précédent" className={monthButton} disabled={month === '0000-01'}
        onClick={() => onChange(addMonths(firstDay, -1).slice(0, 7))}>
        <Icon icon={ChevronLeft} />
      </button>
      <p role="status" className="text-center text-sm font-semibold text-slate-900">{formatSpendingMonth(month)}</p>
      <button type="button" aria-label="Mois suivant" className={monthButton} disabled={month >= currentMonth}
        onClick={() => onChange(addMonths(firstDay, 1).slice(0, 7))}>
        <Icon icon={ChevronRight} />
      </button>
    </div>
  );
}
