import Card from '@/components/ui/Card';
import AlertBanner from '@/components/ui/AlertBanner';
import MediationTimeline from '@/components/mediation/MediationTimeline';
import { formatDate } from '@/lib/budget-calculations';
import { mockMediationFile } from '@/lib/mock-data';

const statusLabels: Record<string, string> = {
  not_started: 'Non démarrée',
  in_progress: 'En cours',
  plan_proposed: 'Plan proposé',
  plan_accepted: 'Plan accepté',
  completed: 'Terminée',
  failed: 'Échec',
};

const statusColors: Record<string, string> = {
  not_started: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  plan_proposed: 'bg-amber-100 text-amber-700',
  plan_accepted: 'bg-green-100 text-green-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-600',
};

export default function MediationPage() {
  const file = mockMediationFile;
  const doneSteps = file.steps.filter((s) => s.status === 'done').length;
  const totalSteps = file.steps.length;

  return (
    <div className="px-4 py-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">🤝 Dossier médiation</h1>
        <p className="text-sm text-gray-500 mt-0.5">Suivi de ta médiation de dettes</p>
      </div>

      <AlertBanner variant="info" title="Important">
        Ne signe aucun accord avec un créancier sans en avoir parlé à ton médiateur.
      </AlertBanner>

      {/* Mediator info card */}
      <Card className="bg-indigo-50 border-indigo-200">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-full bg-indigo-200 flex items-center justify-center text-2xl flex-shrink-0">
            🤝
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-indigo-800">{file.mediatorName}</p>
            <p className="text-xs text-indigo-600 mt-0.5">{file.mediatorOrganization}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[file.status]}`}>
                {statusLabels[file.status]}
              </span>
              <span className="text-xs text-gray-500">
                {doneSteps}/{totalSteps} étapes
              </span>
            </div>
          </div>
        </div>
        {file.startDate && (
          <p className="text-xs text-gray-500 mt-3 pt-2 border-t border-indigo-200">
            📅 Démarrée le {formatDate(file.startDate)}
          </p>
        )}
      </Card>

      {/* Next appointment */}
      {file.nextAppointment && (
        <Card className="bg-amber-50 border-amber-200">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📅</span>
            <div>
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                Prochain rendez-vous
              </p>
              <p className="text-base font-bold text-amber-800 mt-0.5">
                {formatDate(file.nextAppointment)}
              </p>
            </div>
          </div>

          {/* Document required for next step */}
          {file.steps.find((s) => s.status === 'pending' && s.documentRequired) && (
            <div className="mt-3 pt-2 border-t border-amber-200">
              <p className="text-xs font-medium text-amber-700 mb-1">📄 Documents à apporter :</p>
              {file.steps
                .filter((s) => s.status === 'pending' && s.documentRequired)
                .map((s) => (
                  <p key={s.id} className="text-xs text-amber-600 italic">• {s.documentRequired}</p>
                ))}
            </div>
          )}
        </Card>
      )}

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="text-sm font-semibold text-gray-700">Avancement</h2>
          <span className="text-xs text-gray-400">{doneSteps}/{totalSteps} étapes</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
          <div
            className="bg-indigo-500 h-2 rounded-full transition-all"
            style={{ width: `${(doneSteps / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {/* Timeline */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3 px-1">Historique des étapes</h2>
        <MediationTimeline steps={file.steps} />
      </div>

      {/* Questions for mediator */}
      {file.questionsForMediator.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            ❓ Questions pour ton médiateur
          </h3>
          <div className="space-y-2">
            {file.questionsForMediator.map((q, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-indigo-400 font-bold mt-0.5">{i + 1}.</span>
                <p className="text-gray-600 leading-relaxed">{q}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
