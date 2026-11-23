export interface ChartPart { label: string; cents: number; share: number; other?: true }

/**
 * Regroupe une répartition en parts affichables : les quatre plus grandes (une couleur distincte chacune),
 * puis « Autres » (gris). Les montants restent en centimes entiers ; la somme des parts est égale au total.
 */
export function chartParts<T extends { cents: number }>(
  rows: readonly T[], label: (row: T) => string, limit = 4,
): ChartPart[] {
  const positive = rows.filter(({ cents }) => cents > 0);
  const total = positive.reduce((sum, { cents }) => sum + cents, 0);
  if (total <= 0) return [];
  const kept = positive.slice(0, limit);
  const others = positive.slice(kept.length).reduce((sum, { cents }) => sum + cents, 0);
  const parts: Omit<ChartPart, 'share'>[] = kept.map((row) => ({ label: label(row), cents: row.cents }));
  if (others > 0) parts.push({ label: 'Autres', cents: others, other: true });
  return parts.map((part) => ({ ...part, share: part.cents / total }));
}
