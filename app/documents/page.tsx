import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import AlertBanner from '@/components/ui/AlertBanner';
import { formatShortDate } from '@/lib/budget-calculations';
import { mockDocuments } from '@/lib/mock-data';
import type { DocumentCategory } from '@/lib/types';

const categoryConfig: Record<DocumentCategory, { label: string; icon: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' }> = {
  invoice: { label: 'Facture', icon: '🧾', variant: 'warning' },
  letter: { label: 'Courrier', icon: '✉️', variant: 'neutral' },
  payment_proof: { label: 'Preuve de paiement', icon: '💳', variant: 'success' },
  mediation: { label: 'Médiation', icon: '🤝', variant: 'accent' },
  income_proof: { label: 'Justificatif revenus', icon: '💰', variant: 'success' },
  child_related: { label: 'Enfants', icon: '👨‍👧‍👦', variant: 'info' },
  other: { label: 'Autre', icon: '📄', variant: 'neutral' },
};

export default function DocumentsPage() {
  return (
    <div className="px-4 py-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">📄 Mes documents</h1>
        <p className="text-sm text-gray-500 mt-0.5">{mockDocuments.length} document{mockDocuments.length > 1 ? 's' : ''} enregistré{mockDocuments.length > 1 ? 's' : ''}</p>
      </div>

      <AlertBanner variant="info" title="Fonctionnalité en cours de développement">
        L&apos;upload de documents arrive bientôt. Pour l&apos;instant, voici la liste de tes
        documents importants à conserver.
      </AlertBanner>

      <div className="space-y-2">
        {mockDocuments.map((doc) => {
          const config = categoryConfig[doc.category] || categoryConfig.other;
          return (
            <Card key={doc.id} className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center text-xl flex-shrink-0">
                {config.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{doc.label}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant={config.variant}>{config.label}</Badge>
                  {doc.isConfidential && (
                    <Badge variant="warning">🔒 Confidentiel</Badge>
                  )}
                  <span className="text-xs text-gray-400">{formatShortDate(doc.date)}</span>
                </div>
                {doc.notes && (
                  <p className="text-xs text-gray-400 mt-0.5 italic">{doc.notes}</p>
                )}
              </div>
              <button
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 transition-colors flex-shrink-0"
                title="Télécharger (bientôt disponible)"
                disabled
              >
                <span className="text-sm">⬇️</span>
              </button>
            </Card>
          );
        })}
      </div>

      {/* Upload CTA */}
      <Card className="border-dashed border-2 border-gray-200 bg-gray-50">
        <div className="text-center py-4">
          <p className="text-3xl mb-2">📎</p>
          <p className="text-sm font-semibold text-gray-600">Ajouter un document</p>
          <p className="text-xs text-gray-400 mt-1 mb-3">
            Factures, courriers, justificatifs... gardez tout au même endroit.
          </p>
          <button
            disabled
            className="bg-gray-200 text-gray-400 text-xs font-medium px-4 py-2 rounded-full cursor-not-allowed"
          >
            Upload bientôt disponible
          </button>
        </div>
      </Card>
    </div>
  );
}
