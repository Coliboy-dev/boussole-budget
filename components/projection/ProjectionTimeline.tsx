import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';
import { formatCurrency, formatShortDate } from '@/lib/budget-calculations';
import type { ProjectionMilestone } from '@/lib/projection';
import { Icon } from '@/components/ui/icons';

// Le statut est toujours écrit : la couleur n’en est qu’un renfort.
export const riskStyles = {
  safe: { label: 'Stable', icon: CircleCheck, chip: 'bg-cap-surface-soft text-cap-success-text', text: 'text-cap-text' },
  fragile: { label: 'Fragile', icon: TriangleAlert, chip: 'bg-cap-warning-soft text-cap-warning-text', text: 'text-cap-warning-text' },
  danger: { label: 'Critique', icon: CircleAlert, chip: 'bg-cap-danger-soft text-cap-danger-text', text: 'text-cap-danger-text' },
};

export function RiskChip({ risk }: { risk: keyof typeof riskStyles }) {
  const style = riskStyles[risk];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${style.chip}`}>
      <Icon icon={style.icon} className="size-3.5" />
      {style.label}
    </span>
  );
}

interface Props {
  milestones: ProjectionMilestone[];
}

export default function ProjectionTimeline({ milestones }: Props) {
  return (
    <ol className="divide-y divide-cap-border">
      {milestones.map((milestone) => (
        <li key={milestone.daysFromNow} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
          <p className="text-sm text-cap-text">
            {milestone.label}
            <time dateTime={milestone.date} className="ml-1 text-xs text-cap-text-muted">· {formatShortDate(milestone.date)}</time>
          </p>
          <p className="flex items-center gap-2">
            <span className={`text-sm font-bold tabular-nums ${riskStyles[milestone.riskLevel].text}`}>{formatCurrency(milestone.balance)}</span>
            <RiskChip risk={milestone.riskLevel} />
          </p>
        </li>
      ))}
    </ol>
  );
}
