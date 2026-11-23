import Link from 'next/link';
import type { AdviceItem } from '@/lib/types';
import { Lightbulb } from 'lucide-react';
import { Icon, toneIcons } from '@/components/ui/icons';

interface AdviceWidgetProps {
  advice: AdviceItem[];
}

const typeConfig: Record<string, { bg: string; border: string; text: string }> = {
  info: { bg: 'bg-cap-secondary-soft', border: 'border-transparent', text: 'text-cap-secondary-text' },
  warning: { bg: 'bg-cap-warning-soft', border: 'border-transparent', text: 'text-cap-warning-text' },
  positive: { bg: 'bg-cap-surface-soft', border: 'border-transparent', text: 'text-cap-success-text' },
  action: { bg: 'bg-cap-surface-soft', border: 'border-transparent', text: 'text-cap-primary-text' },
};

export default function AdviceWidget({ advice }: AdviceWidgetProps) {
  const topAdvice = advice.slice(0, 2);

  return (
    <section className="rounded-[19px] border border-cap-border bg-cap-surface p-4 shadow-[0_1px_2px_rgba(23,44,55,0.04)]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-cap-text"><Icon icon={Lightbulb} className="size-4 text-cap-primary-text" />Conseils</h3>
        <Link href="/conseils" className="text-xs text-cap-primary-text font-semibold underline">
          Voir tout
        </Link>
      </div>
      <div className="space-y-2">
        {topAdvice.map((item) => {
          const config = typeConfig[item.type] || typeConfig.info;
          return (
            <div
              key={item.id}
              className={`rounded-xl border p-3 ${config.bg} ${config.border}`}
            >
              <div className="flex items-start gap-2">
                <Icon icon={toneIcons[item.type] ?? toneIcons.info} className={`mt-0.5 size-4 shrink-0 ${config.text}`} />
                <div>
                  <p className={`text-xs font-semibold mb-0.5 ${config.text}`}>{item.title}</p>
                  <p className="text-xs text-cap-text leading-relaxed">{item.message}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
