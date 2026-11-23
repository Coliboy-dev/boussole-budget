import { Baby, Banknote, Car, Cross, Ellipsis, Gift, House, PawPrint, Plane, Shirt, ShoppingBasket, Sparkles, Ticket, Utensils, type LucideIcon } from 'lucide-react';
import type { SpendingCategory } from '@/lib/types';

export const spendingCategoryIcons: Record<SpendingCategory, LucideIcon> = {
  groceries: ShoppingBasket,
  restaurants: Utensils,
  transport: Car,
  health: Cross,
  leisure: Ticket,
  clothing: Shirt,
  home: House,
  children: Baby,
  cash: Banknote,
  pets: PawPrint,
  gifts: Gift,
  beauty: Sparkles,
  travel: Plane,
  other: Ellipsis,
};
