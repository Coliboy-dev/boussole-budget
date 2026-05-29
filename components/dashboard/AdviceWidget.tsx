import Link from 'next/link';
import Card from '@/components/ui/Card';
import type { AdviceItem } from '@/lib/types';

interface AdviceWidgetProps {
  advice: AdviceItem[];
}

const typeConfig: Record<string, { icon: string; bg: string; border: string; text: string }> = {
  info: { icon: 'ℹ️', bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-700' },
  warning: { icon: '⚠️', bg: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-700' },
  positive: { icon: '✨', bg: 'bg-green-50', border: 'border-green-100', text: 'text-green-700' },
  action: { icon: '👉', bg: 'bg-indigo-50', border: 'border-indigo-100', text: 'text-indigo-700' },
};

export default function AdviceWidget({ advice }: AdviceWidgetProps) {
  const topAdvice = advice.slice(0, 2);

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">💡 Conseils</h3>
        <Link href="/conseils" className="text-xs text-teal-600 font-medium hover:underline">
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
                <span className="text-base mt-0.5">{config.icon}</span>
                <div>
                  <p className={`text-xs font-semibold mb-0.5 ${config.text}`}>{item.title}</p>
                  <p className="text-xs text-gray-600 leading-relaxed">{item.message}</p>
                  {item.requiresMediatorValidation && (
                    <p className="text-xs text-indigo-500 mt-1 font-medium">
                      🤝 À valider avec ton médiateur
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
