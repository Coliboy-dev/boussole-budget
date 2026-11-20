import { Baby, Banknote, Car, Cross, Ellipsis, House, Shirt, ShoppingBasket, Ticket, Utensils, type LucideIcon } from 'lucide-react';
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
  other: Ellipsis,
};
