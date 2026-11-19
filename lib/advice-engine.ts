import type { BudgetSummary, AdviceItem, Debt, MediationFile } from './types';
import { daysBetween, isLocalDate, todayInBrussels } from './local-date.ts';

export function generateAdvice(
  summary: BudgetSummary,
  debts: Debt[],
  mediation: MediationFile | null,
  today = todayInBrussels(),
): AdviceItem[] {
  const advice: AdviceItem[] = [];

  // Check for late debts
  const lateDebts = debts.filter((d) => d.status === 'late');
  const mediationDebts = debts.filter((d) => d.status === 'in_mediation');

  // Budget tight
  if (summary.trueAvailable < 100) {
    advice.push({
      id: 'adv-tight-budget',
      title: 'Budget serré ce mois-ci',
      message:
        'Ton budget est serré ce mois-ci. Essaie de reporter les dépenses non urgentes et évite les achats imprévus. Chaque euro compte.',
      type: 'warning',
      priority: 1,
    });
  } else if (summary.trueAvailable < 200) {
    advice.push({
      id: 'adv-watch-budget',
      title: 'Surveille ton budget',
      message:
        'Ta marge est limitée ce mois-ci. Garde un œil sur tes dépenses et priorise les charges essentielles.',
      type: 'warning',
      priority: 2,
    });
  }

  // Danger level
  if (summary.riskLevel === 'danger') {
    advice.push({
      id: 'adv-danger',
      title: 'Situation financière critique',
      message:
        'Ton solde disponible est insuffisant pour couvrir toutes tes charges. Contacte ton médiateur ou le CPAS dès que possible pour trouver des solutions.',
      type: 'action',
      priority: 1,
      requiresMediatorValidation: true,
    });
  }

  // Late debts
  if (lateDebts.length > 0) {
    advice.push({
      id: 'adv-late-debts',
      title: 'Dettes en retard',
      message: `Tu as ${lateDebts.length === 1 ? 'une dette en retard' : `${lateDebts.length} dettes en retard`}. Parles-en à ton médiateur avant que la situation ne s'aggrave. Ne contacte pas les créanciers seul(e).`,
      type: 'warning',
      priority: 1,
      requiresMediatorValidation: true,
    });
  }

  // Mediation in progress
  if (mediation && mediation.status === 'in_progress' && mediationDebts.length > 0) {
    advice.push({
      id: 'adv-mediation',
      title: 'Médiation en cours',
      message:
        'À valider avec ton médiateur avant tout accord avec un créancier. Ne signe rien sans l\'avoir consulté(e) au préalable.',
      type: 'action',
      priority: 2,
      requiresMediatorValidation: true,
    });
  }

  // Next mediation appointment soon
  if (isLocalDate(mediation?.nextAppointment)) {
    const daysUntil = daysBetween(today, mediation.nextAppointment);
    if (daysUntil <= 14 && daysUntil > 0) {
      advice.push({
        id: 'adv-mediation-appt',
        title: 'Rendez-vous médiation proche',
        message: `Ton prochain rendez-vous avec ${mediation.mediatorName || 'ton médiateur'} est dans ${daysUntil} jour${daysUntil > 1 ? 's' : ''}. Prépare tes documents à l\'avance.`,
        type: 'info',
        priority: 2,
      });
    }
  }

  // Savings capacity positive
  if (summary.savingsCapacity > 0 && summary.riskLevel !== 'danger') {
    const monthlyAmount = Math.min(summary.savingsCapacity, summary.trueAvailable * 0.3);
    if (monthlyAmount > 10) {
      advice.push({
        id: 'adv-savings',
        title: 'Capacité d\'épargne',
        message: `Tu peux mettre de côté environ ${Math.floor(monthlyAmount)}€ ce mois-ci. Même une petite épargne régulière constitue un filet de sécurité important.`,
        type: 'positive',
        priority: 3,
      });
    }
  }

  // Safety reserve reminder
  if (summary.currentBalance < summary.safetyReserve * 3) {
    advice.push({
      id: 'adv-reserve',
      title: 'Réserve de sécurité basse',
      message:
        'Essaie de maintenir au minimum 150€ de réserve dans ton compte pour faire face aux imprévus. Prioritise cet objectif dès que possible.',
      type: 'info',
      priority: 3,
    });
  }

  // Unconfirmed income
  advice.push({
    id: 'adv-income-confirm',
    title: 'Revenus incertains',
    message:
      'La pension alimentaire n\'est pas toujours versée à temps. Planifie ton budget sans elle pour éviter les mauvaises surprises.',
    type: 'info',
    priority: 4,
  });

  // Contested debt
  const contestedDebts = debts.filter((d) => d.status === 'contested');
  if (contestedDebts.length > 0) {
    advice.push({
      id: 'adv-contested',
      title: 'Dette contestée',
      message:
        'Tu as une dette contestée. Rassemble tous les documents qui prouvent ton désaccord et consulte un conseiller juridique ou ton médiateur.',
      type: 'action',
      priority: 2,
      requiresMediatorValidation: true,
    });
  }

  // Sort by priority
  return advice.sort((a, b) => a.priority - b.priority);
}
