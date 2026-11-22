// Règles du mot de passe du compte. Supabase le vérifie et le stocke ; il ne sert pas à chiffrer le budget.

export const MIN_PASSWORD_LENGTH = 12;
/** Supabase refuse au-delà de 72 caractères (limite de bcrypt). */
export const MAX_PASSWORD_LENGTH = 72;

export function passwordProblem(password: string, confirmation?: string): string | undefined {
  if (password.length < MIN_PASSWORD_LENGTH) return `Choisis un mot de passe d’au moins ${MIN_PASSWORD_LENGTH} caractères.`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Choisis un mot de passe de ${MAX_PASSWORD_LENGTH} caractères au maximum.`;
  if (password.trim() !== password) return 'Le mot de passe ne peut pas commencer ni finir par un espace.';
  if (confirmation !== undefined && confirmation !== password) return 'Les deux mots de passe ne correspondent pas.';
  return undefined;
}
