// Budgets fictifs du 29 mai 2026 pour Budget et Analyse (lot 4) : ceux des Échéances, plus des dépenses encodées.
import { scenarios as base, today } from './projection-scenarios.mjs';

export { today };

const spending = (id, date, amount, category, label) => ({
  id, date, amount, category, ...(label && { label }), balanceIncluded: false, debited: true, balanceRevision: 0,
});

const spendings = [
  spending('s1', '2026-05-04', 64.2, 'groceries', 'Supermarché'),
  spending('s2', '2026-05-11', 38.9, 'groceries'),
  spending('s3', '2026-05-12', 27.5, 'restaurants', 'Friterie'),
  spending('s4', '2026-05-15', 12, 'transport'),
  spending('s5', '2026-05-18', 22.4, 'health', 'Pharmacie'),
  spending('s6', '2026-05-21', 15, 'leisure'),
  spending('s7', '2026-05-23', 41.99, 'clothing'),
  spending('s8', '2026-04-20', 55, 'groceries'),
];

export const scenarios = {
  demo: base.demo,
  fragile: base.fragile,
  negatif: base.negatif,
  depenses: {
    ...base.demo,
    spendings,
    envelopes: [{ id: 'e1', category: 'groceries', label: 'Courses', monthlyAmount: 300 }],
  },
  'sans-echeance': base['sans-echeance'],
};
