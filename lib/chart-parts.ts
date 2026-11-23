/**
 * Regroupe une répartition en parts affichables : les plus grandes, puis « Autres ».
 * Les montants restent en centimes entiers ; la somme des parts est égale au total.
 */
export function chartParts<T extends { cents: number }>(
  rows: readonly T[], label: (row: T) => string, limit = 4,
): { label: string; cents: number; share: number }[] {
  const positive = rows.filter(({ cents }) => cents > 0);
  const total = positive.reduce((sum, { cents }) => sum + cents, 0);
  if (total <= 0) return [];
  const kept = positive.length > limit + 1 ? positive.slice(0, limit) : positive;
  const others = positive.slice(kept.length).reduce((sum, { cents }) => sum + cents, 0);
  const parts = kept.map((row) => ({ label: label(row), cents: row.cents }));
  if (others > 0) parts.push({ label: 'Autres', cents: others });
  return parts.map((part) => ({ ...part, share: part.cents / total }));
}
