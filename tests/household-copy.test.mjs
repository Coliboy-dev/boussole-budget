import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCurrency } from '../lib/budget-calculations.ts';
import { householdCopy, householdMessages } from '../lib/household-copy.ts';

process.env.TZ = 'Europe/Brussels';

const currency = (cents) => formatCurrency(cents / 100);
const examples = {
  contributionPending: [['2026-11-28'], 'Versement prévu le 28 — réception non confirmée'],
  shortfallBefore: [[12000, '2026-12-01'], `${currency(12000)} supplémentaires sont nécessaires avant le 1 déc. pour couvrir les échéances prévues`],
  dependsOnContributions: [['loyer', '2026-12-01', 2], 'Le paiement du loyer du 1er dépend de 2 versements encore attendus'],
  reserveShortfall: [[2000, '2026-12-01', false], `La réserve serait entamée de ${currency(2000)} le 1 déc.`],
  transfersForHousehold: [[80000], `Virements et avances pour le foyer : ${currency(80000)}`],
  receivedTransfers: [[5000], `Transferts reçus : ${currency(5000)}`],
  advanceMirror: [['Courses'], 'Avancé pour le foyer : Courses'],
  advancePaidBy: [['Sam'], 'Payé par Sam depuis son compte personnel'],
  transferConfirmedBy: [['Ancien membre'], 'Confirmé par Ancien membre'],
  sharedWith: [['Sam'], 'Ce foyer est partagé avec Sam.'],
  stopSharingWith: [['Sam'], 'Arrêter le partage avec Sam'],
  copyTitle: [['23 nov.'], 'Copie en lecture seule, arrêtée le 23 nov'],
  copyBalanceDate: [['23 nov.'], 'au 23 nov'],
  formerHouseholdSince: [['23 nov.'], 'Accès au foyer terminé le 23 nov.'],
  // La date abrégée garde un seul point final.
  contributionMirrorOffer: [[60000, 'monthly', false], `Versement au compte commun de ${currency(60000)} par mois. L’ajouter à ton budget personnel ?`],
};

const prohibited = /\b(te|vous|lui|me) doi(t|s|vent)\b|\bdoi(t|s|vent) (payer|verser|rembourser|ajouter)\b|n['’]a (pas|toujours pas) (payé|versé|remboursé)|\btrop dépensé\b|\brappelle[- ]lui\b|\bexclu(e)?\b|\bparticipe moins\b|\bmauvaise? gestion\b|\bà rembourser\b/iu;

test('F-F · les textes du Foyer sont descriptifs et les formulations de référence sont stables', () => {
  assert.deepEqual(Object.keys(householdMessages).sort(), Object.keys(examples).sort());
  for (const [name, message] of Object.entries(householdCopy)) assert.doesNotMatch(message, prohibited, name);
  for (const [name, [params, expected]] of Object.entries(examples)) {
    const message = householdMessages[name](...params);
    assert.equal(message, expected, name);
    assert.doesNotMatch(message, prohibited, name);
  }
});

test('F-F · départ et arrêt du partage : textes exacts de la charte (§2.3)', () => {
  assert.equal(householdCopy.sharingDisabled, 'Le partage de ce foyer a été désactivé.');
  assert.equal(householdCopy.noLongerShared, 'Les nouvelles informations de ce foyer ne seront plus partagées avec ce compte.');
  assert.equal(householdCopy.personalStaysPrivate, 'Les données personnelles de chaque membre restent privées.');
  assert.equal(householdCopy.formerMemberMayKeep,
    'Certaines informations déjà consultées ou enregistrées par un ancien membre peuvent rester en sa possession.');
  assert.equal(householdCopy.inviteHelp,
    'Envoie ce lien uniquement à la personne avec qui tu partages ce foyer. Il est valable 7 jours, une seule fois.');
});
