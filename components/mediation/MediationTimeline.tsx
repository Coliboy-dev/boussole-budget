import { formatDate } from '@/lib/budget-calculations';
import type { MediationStep, MediationStepStatus } from '@/lib/types';

interface MediationTimelineProps {
  steps: MediationStep[];
}

const statusConfig: Record<MediationStepStatus, { icon: string; color: string; bg: string; line: string }> = {
  done: { icon: '✅', color: 'text-green-700', bg: 'bg-green-100', line: 'bg-green-300' },
  in_progress: { icon: '🔄', color: 'text-blue-700', bg: 'bg-blue-100', line: 'bg-blue-300' },
  pending: { icon: '⏳', color: 'text-gray-500', bg: 'bg-gray-100', line: 'bg-gray-200' },
  cancelled: { icon: '❌', color: 'text-red-500', bg: 'bg-red-50', line: 'bg-red-200' },
};

const statusLabels: Record<MediationStepStatus, string> = {
  done: 'Terminé',
  in_progress: 'En cours',
  pending: 'À venir',
  cancelled: 'Annulé',
};

export default function MediationTimeline({ steps }: MediationTimelineProps) {
  return (
    <div className="relative">
      {steps.map((step, index) => {
        const config = statusConfig[step.status];
        const isLast = index === steps.length - 1;

        return (
          <div key={step.id} className="flex gap-4 relative">
            {/* Timeline line */}
            {!isLast && (
              <div className="absolute left-5 top-10 bottom-0 w-0.5 bg-gray-200" />
            )}

            {/* Icon */}
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base flex-shrink-0 z-10 ${config.bg}`}>
              {config.icon}
            </div>

            {/* Content */}
            <div className={`flex-1 pb-6 ${isLast ? '' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <p className={`text-sm font-semibold ${config.color}`}>{step.title}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${config.bg} ${config.color}`}>
                  {statusLabels[step.status]}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{formatDate(step.date)}</p>
              <p className="text-sm text-gray-600 mt-1 leading-relaxed">{step.description}</p>
              {step.creditorName && (
                <p className="text-xs text-gray-400 mt-1">
                  💳 Créancier : {step.creditorName}
                </p>
              )}
              {step.documentRequired && (
                <div className="mt-2 text-xs bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  <span className="font-medium text-amber-700">📄 Document requis : </span>
                  <span className="text-amber-600">{step.documentRequired}</span>
                </div>
              )}
              {step.notes && (
                <p className="text-xs text-gray-400 mt-1 italic">{step.notes}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
