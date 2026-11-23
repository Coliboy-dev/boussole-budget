import {
  Banknote,
  Blocks,
  BookOpen,
  Bus,
  CircleAlert,
  CircleCheck,
  Dumbbell,
  HandHeart,
  House,
  Info,
  Landmark,
  Lightbulb,
  Package,
  Pill,
  Shirt,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Sparkles,
  TriangleAlert,
  Tv,
  Volleyball,
  Zap,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';
import type { ChildExpenseCategory, ExpenseCategory } from '@/lib/types';
import { householdCopy } from '@/lib/household-copy';

export const expenseCategoryLabels: Record<ExpenseCategory, string> = {
  rent: 'Logement',
  energy: 'Énergie',
  phone: 'Téléphone',
  insurance: 'Assurance',
  groceries: 'Courses',
  transport: 'Transport',
  health: 'Santé',
  school: 'Scolarité',
  subscriptions: 'Abonnements',
  alimony: 'Contribution alimentaire',
  taxes: 'Impôts et taxes',
  childcare: 'Garde d’enfants',
  activities: 'Sport, loisirs et cours',
  other: 'Autre',
  household: householdCopy.transfers,
};

/**
 * Catégories de charges proposées à la saisie (même règle en deux mises en ligne que lib/spending.ts) ;
 * « Courses » n'est plus proposé pour une nouvelle charge (enveloppe + dépenses), le transfert foyer jamais.
 */
export const selectableExpenseCategories = (Object.keys(expenseCategoryLabels) as ExpenseCategory[])
  .filter((category) => category !== 'household' && category !== 'groceries');

export const expenseCategoryIcons: Record<ExpenseCategory, LucideIcon> = {
  rent: House,
  energy: Zap,
  phone: Smartphone,
  insurance: ShieldCheck,
  groceries: ShoppingCart,
  transport: Bus,
  health: Pill,
  school: BookOpen,
  subscriptions: Tv,
  alimony: HandHeart,
  taxes: Landmark,
  childcare: Blocks,
  activities: Dumbbell,
  other: Banknote,
  household: Banknote,
};

export const childCategoryIcons: Record<ChildExpenseCategory, LucideIcon> = {
  school: BookOpen,
  clothing: Shirt,
  activities: Volleyball,
  health: Pill,
  transport: Bus,
  other: Package,
};

export type Tone = 'info' | 'warning' | 'danger' | 'success' | 'positive' | 'action';

export const toneIcons: Record<Tone, LucideIcon> = {
  info: Info,
  warning: TriangleAlert,
  danger: CircleAlert,
  success: CircleCheck,
  positive: Sparkles,
  action: Lightbulb,
};

/** Icône décorative : masquée des lecteurs d’écran, trait fin et cohérent. */
export function Icon({ icon: Glyph, className = 'size-5', ...props }: { icon: LucideIcon } & LucideProps) {
  return <Glyph aria-hidden="true" focusable="false" strokeWidth={1.85} className={className} {...props} />;
}
