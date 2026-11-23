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
  paidWithPersonal: 'Payé avec mon argent personnel',
  jointAccountChoice: 'Nous n’avons pas de compte commun',
  noJointAccount: 'Ce foyer fonctionne sans compte commun.',
  movements: 'Mouvements du foyer',
  advances: 'Avances pour le foyer',
  advance: 'Avancé pour le foyer',
  transferOutgoing: 'Transfert vers l’autre membre',
  transferIncoming: 'Transfert reçu',
  transferTitle: 'Transferts entre vous',
  transferAmount: 'Montant du transfert (€)',
  transferDate: 'Date du transfert',
  transferCreate: 'Déclarer un transfert',
  transferEdit: 'Modifier le transfert',
  transferConfirm: 'Confirmer la réception',
  transferNotReceived: 'Pas reçu',
  transferAwaiting: 'À confirmer',
  transferDelete: 'Retirer la déclaration',
  transferDeleteQuestion: 'Retirer cette déclaration du foyer ?',
  transferChanged: 'Le transfert a changé. Vérifie le montant affiché.',
  transferPartnerNeeded: 'Les transferts sont disponibles quand un autre membre rejoint le foyer.',
  transferEarlierResponse: 'Réponse à une version précédente',
  formerMember: 'Ancien membre',
  memberYou: 'Toi',
  otherMember: 'Autre membre',
  movementRecap: 'Ce récapitulatif décrit les mouvements enregistrés. Il ne détermine pas comment les dépenses doivent être réparties entre vous.',
  cancel: 'Annuler',
  members: 'Membres du foyer',
  aloneMember: 'Tu es pour l’instant le seul membre de ce foyer.',
  invite: 'Inviter une personne',
  inviteCreate: 'Créer un lien d’invitation',
  inviteHelp: 'Envoie ce lien uniquement à la personne avec qui tu partages ce foyer. Il est valable 7 jours, une seule fois.',
  inviteLink: 'Lien d’invitation',
  inviteShare: 'Partager le lien',
  inviteCopy: 'Copier le lien',
  inviteCopied: 'Lien copié.',
  inviteRevoke: 'Annuler l’invitation',
  inviteRevoked: 'Invitation annulée. Le lien ne fonctionne plus.',
  inviteFull: 'Ce foyer a déjà deux membres.',
  joinTitle: 'Rejoindre un foyer',
  join: 'Rejoindre ce foyer',
  joinHelp: 'Tu rejoins ce foyer avec ton propre compte. Tes données personnelles restent privées.',
  joinSignIn: 'Connecte-toi à ton propre compte, puis rouvre le lien d’invitation.',
  joinInvalidLink: 'Ce lien d’invitation est incomplet. Demande un nouveau lien.',
  invitationInvalid: 'Cette invitation n’est plus valable.',
  leave: 'Quitter le foyer',
  leaveConfirm: 'Quitter ce foyer',
  stopSharingConfirm: 'Arrêter le partage',
  sharingDisabled: 'Le partage de ce foyer a été désactivé.',
  noLongerShared: 'Les nouvelles informations de ce foyer ne seront plus partagées avec ce compte.',
  personalStaysPrivate: 'Les données personnelles de chaque membre restent privées.',
  formerMemberMayKeep: 'Certaines informations déjà consultées ou enregistrées par un ancien membre peuvent rester en sa possession.',
  localCopyKept: 'Une copie du foyer reste sur cet appareil. Elle n’est plus mise à jour.',
  unreadableItems: 'Des éléments du foyer sont illisibles sur cet appareil. Les montants affichés peuvent être incomplets.',
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
  receivedTransfers: (amountCents: number) =>
    `Transferts reçus : ${formatCurrency(fromCents(amountCents))}`,
  advanceMirror: (label: string) => label ? `Avancé pour le foyer : ${label}` : 'Avancé pour le foyer',
  advancePaidBy: (name: string) => `Payé par ${name} depuis son compte personnel`,
  transferConfirmedBy: (name: string) => `Confirmé par ${name}`,
  sharedWith: (name: string) => `Ce foyer est partagé avec ${name}.`,
  stopSharingWith: (name: string) => `Arrêter le partage avec ${name}`,
  formerHouseholdSince: (date: string) => `Accès au foyer terminé le ${date.replace(/\.$/, '')}.`,
  contributionMirrorOffer: (amountCents: number, frequency: Frequency, update: boolean) => {
    const amount = [formatCurrency(fromCents(amountCents)), mirrorFrequency[frequency]].filter(Boolean).join(' ');
    const question = update ? 'Mettre à jour ton budget personnel ?' : 'L’ajouter à ton budget personnel ?';
    return `Versement au compte commun de ${amount}. ${question}`;
  },
};
