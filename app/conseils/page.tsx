import Card from '@/components/ui/Card';
import { calculateBudgetSummary } from '@/lib/budget-calculations';
import { generateAdvice } from '@/lib/advice-engine';
import {
  mockUser,
  mockCurrentBalance,
  mockIncomes,
  mockExpenses,
  mockDebts,
  mockChildExpenses,
  mockMediationFile,
} from '@/lib/mock-data';

const typeConfig: Record<string, { icon: string; bg: string; border: string; text: string; label: string }> = {
  info: { icon: 'ℹ️', bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-700', label: 'Info' },
  warning: { icon: '⚠️', bg: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-700', label: 'Attention' },
  positive: { icon: '✨', bg: 'bg-green-50', border: 'border-green-100', text: 'text-green-700', label: 'Positif' },
  action: { icon: '👉', bg: 'bg-indigo-50', border: 'border-indigo-100', text: 'text-indigo-700', label: 'À faire' },
};

export default function ConseilsPage() {
  const summary = calculateBudgetSummary(
    mockCurrentBalance,
    mockIncomes,
    mockExpenses,
    mockDebts,
    mockChildExpenses,
    mockUser.safetyReserve
  );

  const advice = generateAdvice(summary, mockDebts, mockMediationFile);

  return (
    <div className="px-4 py-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">💡 Conseils personnalisés</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {advice.length} conseil{advice.length > 1 ? 's' : ''} basé{advice.length > 1 ? 's' : ''} sur ta situation
        </p>
      </div>

      <div className="space-y-3">
        {advice.map((item, index) => {
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
                    <span className={`text-xs px-1.5 py-0.5 rounded ${config.bg} ${config.text} font-medium`}>
                      #{index + 1}
                    </span>
                  </div>
                  <p className={`text-sm font-semibold mb-1 ${config.text}`}>{item.title}</p>
                  <p className="text-sm text-gray-600 leading-relaxed">{item.message}</p>
                  {item.requiresMediatorValidation && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="text-base">🤝</span>
                      <p className="text-xs text-indigo-600 font-medium">
                        À valider avec ton médiateur avant d&apos;agir
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Disclaimer */}
      <Card className="border-dashed border-gray-200 bg-gray-50">
        <p className="text-xs text-gray-400 leading-relaxed text-center">
          Ces conseils sont générés automatiquement. Ils ne remplacent pas l&apos;avis d&apos;un
          professionnel. En cas de doute, consulte ton médiateur ou un conseiller financier.
        </p>
      </Card>
    </div>
  );
}
