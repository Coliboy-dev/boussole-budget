import {
  Banknote,
  BookOpen,
  Bus,
  CircleAlert,
  CircleCheck,
  House,
  Info,
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
  other: Banknote,
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
