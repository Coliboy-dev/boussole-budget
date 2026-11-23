import { serializeBudget, type AppState } from './budget-state.ts';

export const HOUSEHOLD_COPY_FORMAT = 'capiste-copie-foyer';

/**
 * Export d'une copie de foyer. L'enveloppe distincte empêche de la restaurer par erreur à la place
 * du budget personnel (la page Sauvegarde la refuse). Aucune clé ni identifiant de compte n'y figure.
 */
export function exportHouseholdCopy(budget: AppState, leftAt: string, exportedAt: string): string {
  return JSON.stringify({
    format: HOUSEHOLD_COPY_FORMAT,
    version: 1,
    leftAt,
    exportedAt,
    budget: JSON.parse(serializeBudget(budget)),
  }, null, 1);
}
