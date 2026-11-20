'use client';

import { formatCurrency } from '@/lib/budget-calculations';
import type { ProjectionMilestone } from '@/lib/projection';
import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';
import { Icon } from '@/components/ui/icons';

const riskConfig = {
  safe: {
    dot: 'border-green-600 text-green-700',
    text: 'text-green-700',
    bg: 'bg-green-50 border-green-200',
    label: 'Stable',
    icon: CircleCheck,
  },
  fragile: {
    dot: 'border-amber-500 text-amber-800',
    text: 'text-amber-800',
    bg: 'bg-amber-50 border-amber-200',
    label: 'Fragile',
    icon: TriangleAlert,
  },
  danger: {
    dot: 'border-red-600 text-red-700',
    text: 'text-red-700',
    bg: 'bg-red-50 border-red-200',
    label: 'Critique',
    icon: CircleAlert,
  },
};

interface Props {
  milestones: ProjectionMilestone[];
}

export default function ProjectionTimeline({ milestones }: Props) {
  return (
    <div className="w-full">
      {/* Horizontal visual with connecting line */}
      <div className="relative flex items-start justify-between mb-1 px-1">
        {/* Background connecting line */}
        <div className="absolute top-4 left-6 right-6 h-0.5 bg-gray-200" />

        {milestones.map((m, i) => {
          const cfg = riskConfig[m.riskLevel];
          return (
            <div key={i} className="relative flex flex-col items-center w-1/4">
              {/* Dot */}
              <div
                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center z-10 mb-2 ${cfg.dot} bg-white`}
              >
                <Icon icon={cfg.icon} className="size-4" />
              </div>
              {/* Label */}
              <p className="text-xs font-semibold text-gray-600 text-center leading-tight mb-1">
                {m.label}
              </p>
              {/* Balance */}
              <p className={`text-sm font-bold text-center ${cfg.text}`}>
                {formatCurrency(m.balance)}
              </p>
              {/* Risk label */}
              <span
                className={`text-xs mt-1 px-1.5 py-0.5 rounded-full border font-medium ${cfg.bg} ${cfg.text}`}
              >
                {cfg.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
