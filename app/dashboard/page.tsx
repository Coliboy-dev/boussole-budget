import Link from 'next/link';
import SummaryCard from '@/components/dashboard/SummaryCard';
import BudgetChart from '@/components/dashboard/BudgetChart';
import UpcomingDeadlines from '@/components/dashboard/UpcomingDeadlines';
import AdviceWidget from '@/components/dashboard/AdviceWidget';
import AlertBanner from '@/components/ui/AlertBanner';
import {
  calculateBudgetSummary,
  getUpcomingReminders,
} from '@/lib/budget-calculations';
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

export default function DashboardPage() {
  const summary = calculateBudgetSummary(
    mockCurrentBalance,
    mockIncomes,
    mockExpenses,
    mockDebts,
    mockChildExpenses,
    mockUser.safetyReserve
  );

  const reminders = getUpcomingReminders(
    mockExpenses,
    mockDebts,
    mockMediationFile.steps
  );

  const advice = generateAdvice(summary, mockDebts, mockMediationFile);

  const quickLinks = [
    { href: '/revenus', label: 'Revenus', icon: '💰', desc: 'Voir mes revenus' },
    { href: '/charges', label: 'Charges', icon: '📋', desc: 'Mes dépenses' },
    { href: '/dettes', label: 'Dettes', icon: '💳', desc: 'Suivi dettes' },
    { href: '/mediation', label: 'Médiation', icon: '🤝', desc: 'Mon dossier' },
    { href: '/objectifs', label: 'Objectifs', icon: '🎯', desc: 'Mes objectifs' },
    { href: '/documents', label: 'Documents', icon: '📄', desc: 'Mes fichiers' },
  ];

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-bold text-gray-800">
          Bonjour {mockUser.firstName} 👋
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Voici un aperçu de ta situation financière
        </p>
      </div>

      {/* Alert banner for risky situations */}
      {summary.riskLevel === 'danger' && (
        <AlertBanner variant="danger" title="Situation critique">
          Ton budget est en déficit ce mois-ci. Contacte ton médiateur dès que possible.
        </AlertBanner>
      )}
      {summary.riskLevel === 'fragile' && (
        <AlertBanner variant="warning" title="Budget fragile">
          Ta marge est très limitée ce mois-ci. Évite les dépenses imprévues.
        </AlertBanner>
      )}

      {/* Main summary cards */}
      <SummaryCard summary={summary} />

      {/* Budget breakdown chart */}
      <BudgetChart summary={summary} />

      {/* Upcoming deadlines */}
      {reminders.length > 0 && (
        <UpcomingDeadlines reminders={reminders} />
      )}

      {/* Advice widget */}
      {advice.length > 0 && (
        <AdviceWidget advice={advice} />
      )}

      {/* Quick links grid */}
      <div>
        <h2 className="text-sm font-semibold text-gray-600 mb-2 px-1">Accès rapide</h2>
        <div className="grid grid-cols-3 gap-2">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="bg-white rounded-2xl border border-gray-100 p-3 flex flex-col items-center gap-1 shadow-sm hover:shadow-md hover:border-teal-200 transition-all"
            >
              <span className="text-2xl">{link.icon}</span>
              <span className="text-xs font-semibold text-gray-700 text-center">{link.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Mediation alert */}
      {mockUser.isInMediation && (
        <AlertBanner variant="info" title="Médiation en cours">
          Ton prochain rendez-vous avec {mockMediationFile.mediatorName} est le{' '}
          <strong>12 juin 2026</strong>. Prépare tes relevés bancaires de mai.{' '}
          <Link href="/mediation" className="underline font-medium">
            Voir le dossier →
          </Link>
        </AlertBanner>
      )}
    </div>
  );
}
