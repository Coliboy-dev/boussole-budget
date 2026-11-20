'use client';

import Link from 'next/link';
import Card from '@/components/ui/Card';
import { useApp } from '@/lib/context/AppContext';

const typeConfig: Record<string, { icon: string; bg: string; border: string; text: string; label: string }> = {
  info: { icon: 'ℹ️', bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-700', label: 'Info' },
  warning: { icon: '⚠️', bg: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-800', label: 'Attention' },
  positive: { icon: '✨', bg: 'bg-green-50', border: 'border-green-100', text: 'text-green-700', label: 'Positif' },
  action: { icon: '👉', bg: 'bg-indigo-50', border: 'border-indigo-100', text: 'text-indigo-700', label: 'À faire' },
};

export default function ConseilsPage() {
  const { advice, summary } = useApp();

  return (
    <div className="px-4 py-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">💡 Conseils personnalisés</h1>
      </div>

      {advice.length === 0 && (
        <Card className="space-y-2">
          <p className="text-sm text-gray-600">
            {summary.emptyBudget
              ? 'Renseigne ton solde et tes échéances pour obtenir des conseils.'
              : 'Aucun conseil pour le moment.'}
          </p>
          {summary.emptyBudget && (
            <Link href="/dashboard" className="text-sm font-medium text-teal-700 underline">
              Renseigner mon solde
            </Link>
          )}
        </Card>
      )}

      <div className="space-y-3">
        {advice.map((item) => {
          const config = typeConfig[item.type] || typeConfig.info;
          return (
            <Card key={item.id} className={`border ${config.border} ${config.bg}`}>
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0 bg-white border ${config.border}`}>
                  {config.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-bold uppercase tracking-wide ${config.text}`}>
                      {config.label}
                    </span>
                  </div>
                  <p className={`text-sm font-semibold mb-1 ${config.text}`}>{item.title}</p>
                  <p className="text-sm text-gray-600 leading-relaxed">{item.message}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

    </div>
  );
}
