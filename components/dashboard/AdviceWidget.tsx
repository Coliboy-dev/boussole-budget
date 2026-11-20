import Link from 'next/link';
import Card from '@/components/ui/Card';
import type { AdviceItem } from '@/lib/types';
import { Lightbulb } from 'lucide-react';
import { Icon, toneIcons } from '@/components/ui/icons';

interface AdviceWidgetProps {
  advice: AdviceItem[];
}

const typeConfig: Record<string, { bg: string; border: string; text: string }> = {
  info: { bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-700' },
  warning: { bg: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-800' },
  positive: { bg: 'bg-green-50', border: 'border-green-100', text: 'text-green-700' },
  action: { bg: 'bg-indigo-50', border: 'border-indigo-100', text: 'text-indigo-700' },
};

export default function AdviceWidget({ advice }: AdviceWidgetProps) {
  const topAdvice = advice.slice(0, 2);

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800"><Icon icon={Lightbulb} className="size-4 text-teal-700" />Conseils</h3>
        <Link href="/conseils" className="text-xs text-teal-800 font-medium hover:underline">
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
                  <p className="text-xs text-gray-600 leading-relaxed">{item.message}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
