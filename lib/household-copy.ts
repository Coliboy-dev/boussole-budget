import { formatCurrency, formatShortDate } from './budget-calculations.ts';
import { fromCents } from './money.ts';
import type { Frequency } from './types.ts';

export const householdCopy = {
  personal: 'Personnel',
  household: 'Notre foyer',
  comingSoon: 'Bientôt disponible',
  switcher: 'Espace budgétaire',
  choose: 'Choisir un foyer',
  createdOn: 'Foyer créé le',
  open: 'Ouvrir le foyer',
  reserveSaved: 'Réserve enregistrée sur cet appareil.',
  create: 'Créer mon foyer',
  createHelp: 'Crée ton budget commun. Tu pourras le retrouver sur un autre appareil en te connectant à ton compte.',
  signIn: 'Connecte-toi pour ouvrir ton foyer.',
  accountChanged: 'Le compte actif a changé. Reconnecte-toi pour ouvrir ton foyer.',
  openAccount: 'Ouvrir Compte et sécurité',
  loading: 'Ouverture du foyer…',
  syncing: 'Synchronisation du foyer…',
  offline: 'Hors ligne. Tes modifications seront envoyées au retour de la connexion.',
  pending: 'Modifications enregistrées sur cet appareil, en attente d’envoi.',
  retry: 'Réessayer',
  unavailable: 'Le foyer est indisponible. Vérifie ta connexion et réessaie.',
  notReady: 'La synchronisation du foyer est temporairement indisponible.',
  revoked: 'Ce compte n’a plus accès à ce foyer.',
  saveFailed: 'La modification du foyer n’a pas pu être enregistrée sur cet appareil.',
  enterBalance: 'Recopie d’abord le solde du compte commun.',
  paymentInvalid: 'Cette échéance ne peut plus être marquée comme payée.',
  undoUnavailable: 'Le budget a changé depuis cette opération. L’annulation n’est plus disponible.',
  reserve: 'Réserve de sécurité du foyer',
  reserveInvalid: 'Indique une réserve en euros supérieure ou égale à zéro.',
  save: 'Enregistrer',
  advicePersonal: 'Les conseils sont disponibles dans ton espace Personnel.',
  confirmedAvailable: 'Disponible confirmé',
  expectedAvailable: 'Avec les versements attendus',
  alreadyBelowZero: 'Le solde du compte commun est déjà sous zéro.',
  attention: 'Point d’attention',
  contribution: 'Versement au compte commun',
  myContribution: 'Mon versement',
  contributionAmount: 'Montant du versement (€)',
  contributionFrequency: 'Fréquence',
  contributionDate: 'Première date prévue',
  contributionAmountInvalid: 'Indique un montant supérieur à zéro, avec deux décimales au maximum.',
  contributionDateInvalid: 'Indique une date valide.',
  contributionSaved: 'Versement enregistré.',
  mirrorOffer: 'Versement dans ton budget personnel',
  mirrorAccept: 'Ajouter',
  mirrorUpdate: 'Mettre à jour',
  mirrorLater: 'Pas maintenant',
  contributionUnavailable: 'Le versement ne peut pas être enregistré pour le moment.',
  upcomingContributions: 'Versements attendus',
  monthlyContributions: 'Versements du mois',
  contributionReceived: 'Reçu',
  recordContribution: 'Marquer comme reçu',
  ownContribution: 'Ton versement',
  otherContribution: 'Autre versement',
  noMonthlyContribution: 'Aucun versement enregistré pour ce mois.',
  transfers: 'Virements vers le compte commun',
  weekly: 'Chaque semaine',
  monthly: 'Chaque mois',
  biMonthly: 'Tous les deux mois',
  quarterly: 'Chaque trimestre',
  annual: 'Chaque année',
};

function dayOfMonth(date: string): string {
  const day = Number(date.slice(-2));
  return day === 1 ? '1er' : String(day);
}

const mirrorFrequency: Record<Frequency, string> = {
  monthly: 'par mois', weekly: 'par semaine', bi_monthly: 'tous les deux mois',
  quarterly: 'par trimestre', annual: 'par an', one_time: '',
};

export const householdMessages = {
  contributionPending: (date: string) =>
    `Versement prévu le ${dayOfMonth(date)} — réception non confirmée`,
  shortfallBefore: (amountCents: number, date: string) =>
    `${formatCurrency(fromCents(amountCents))} supplémentaires sont nécessaires avant le ${formatShortDate(date)} pour couvrir les échéances prévues`,
  dependsOnContributions: (label: string, date: string, count: number) => {
    const payment = label.toLowerCase() === 'loyer' ? 'du loyer' : `de l’échéance « ${label} »`;
    const expected = count === 1 ? 'd’un versement encore attendu' : `de ${count} versements encore attendus`;
    return `Le paiement ${payment} du ${dayOfMonth(date)} dépend ${expected}`;
  },
  reserveShortfall: (amountCents: number, date: string, alreadyBelow: boolean) => {
    const amount = formatCurrency(fromCents(amountCents));
    return alreadyBelow
      ? `Le solde est déjà sous la réserve de ${amount}.`
      : `La réserve serait entamée de ${amount} le ${formatShortDate(date).replace(/\.$/, '')}.`;
  },
  transfersForHousehold: (amountCents: number) =>
    `Virements et avances pour le foyer : ${formatCurrency(fromCents(amountCents))}`,
  contributionMirrorOffer: (amountCents: number, frequency: Frequency, update: boolean) => {
    const amount = [formatCurrency(fromCents(amountCents)), mirrorFrequency[frequency]].filter(Boolean).join(' ');
    const question = update ? 'Mettre à jour ton budget personnel ?' : 'L’ajouter à ton budget personnel ?';
    return `Versement au compte commun de ${amount}. ${question}`;
  },
};
