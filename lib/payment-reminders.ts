import { addDays } from './local-date.ts';
import type { Reminder } from './types.ts';

export function selectUpcomingPaymentReminders(
  reminders: readonly Reminder[],
  today: string,
  remindersEnabled: boolean,
) {
  const tomorrow = addDays(today, 1);
  const upcoming = reminders.filter(({ isLate }) => !isLate);

  return upcoming.flatMap((reminder, index) => {
    const remindTomorrow = remindersEnabled
      && reminder.dueDate === tomorrow
      && (reminder.type === 'expense' || reminder.type === 'debt');

    // Garde l’aperçu habituel et ajoute les paiements de demain au-delà des trois premières lignes.
    return index < 3 || remindTomorrow ? [{ reminder, remindTomorrow }] : [];
  });
}
