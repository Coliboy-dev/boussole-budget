import type { Income, Expense, Debt, ChildExpense } from './types';

export interface ProjectionEvent {
  id: string;
  date: string; // ISO
  label: string;
  amount: number; // positive = income, negative = outgoing
  type: 'income' | 'expense' | 'debt';
  isEstimated: boolean;
}

export interface ProjectionMilestone {
  label: string; // "Aujourd'hui", "Dans 7 jours", etc.
  date: string; // ISO
  daysFromNow: number;
  balance: number;
  riskLevel: 'safe' | 'fragile' | 'danger';
}

export interface ProjectionResult {
  milestones: ProjectionMilestone[]; // today, +7, +15, +30
  events: ProjectionEvent[]; // all events in next 30 days, sorted
  lowestBalance: number;
  lowestDate: string;
  lowestDaysFromNow: number;
  safetyWarning: boolean; // balance dips below safetyReserve at some point
}

function addDays(from: Date, n: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + n);
  return d;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysFrom(today: Date, dateStr: string): number {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

// Next occurrence of a given day-of-month from a reference date
function nextDayOfMonth(dayNum: number, from: Date): Date {
  const result = new Date(from.getFullYear(), from.getMonth(), dayNum);
  if (result <= from) result.setMonth(result.getMonth() + 1);
  return result;
}

export function buildProjection(
  currentBalance: number,
  incomes: Income[],
  expenses: Expense[],
  debts: Debt[],
  childExpenses: ChildExpense[],
  safetyReserve: number
): ProjectionResult {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const events: ProjectionEvent[] = [];

  // --- Income events ---
  incomes.forEach((inc) => {
    if (inc.frequency === 'one_time') return;

    let eventDate: string | null = null;
    let estimated = false;

    if (inc.expectedDate) {
      const days = daysFrom(today, inc.expectedDate);
      if (days >= 0 && days <= 30) {
        eventDate = inc.expectedDate;
        estimated = !inc.isConfirmed;
      }
    } else if (inc.frequency === 'monthly') {
      // Estimate on day 5 of next occurrence
      const candidate = nextDayOfMonth(5, today);
      const days = daysFrom(today, toISO(candidate));
      if (days <= 30) {
        eventDate = toISO(candidate);
        estimated = true;
      }
    }

    if (eventDate) {
      events.push({
        id: `inc-${inc.id}`,
        date: eventDate,
        label: inc.label,
        amount: inc.amount,
        type: 'income',
        isEstimated: estimated,
      });
    }
  });

  // --- Expense events ---
  expenses.forEach((exp) => {
    if (exp.isPaid) return;
    if (exp.frequency === 'one_time') return;

    let eventDate: string | null = null;
    let estimated = false;

    if (exp.dueDate) {
      const days = daysFrom(today, exp.dueDate);
      if (days >= 0 && days <= 30) {
        eventDate = exp.dueDate;
      }
    } else if (exp.isRecurring) {
      // Estimate on day 15 of current/next month
      const candidate = nextDayOfMonth(15, today);
      const days = daysFrom(today, toISO(candidate));
      if (days <= 30) {
        eventDate = toISO(candidate);
        estimated = true;
      }
    }

    if (eventDate) {
      events.push({
        id: `exp-${exp.id}`,
        date: eventDate,
        label: exp.label,
        amount: -exp.amount,
        type: 'expense',
        isEstimated: estimated,
      });
    }
  });

  // --- Debt payment events ---
  debts.forEach((debt) => {
    if (debt.status === 'completed' || debt.status === 'suspended') return;
    if (debt.monthlyPayment <= 0) return;

    if (debt.nextDueDate) {
      const days = daysFrom(today, debt.nextDueDate);
      if (days >= 0 && days <= 30) {
        events.push({
          id: `debt-${debt.id}`,
          date: debt.nextDueDate,
          label: `Remboursement ${debt.creditor}`,
          amount: -debt.monthlyPayment,
          type: 'debt',
          isEstimated: false,
        });
      }
    }
  });

  // Sort by date then by type (income before expenses on same day)
  events.sort((a, b) => {
    const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    // Income first on same day
    if (a.amount > 0 && b.amount < 0) return -1;
    if (a.amount < 0 && b.amount > 0) return 1;
    return 0;
  });

  // --- Compute running balance day by day ---
  const dailyDeltas: Record<string, number> = {};
  events.forEach((e) => {
    dailyDeltas[e.date] = (dailyDeltas[e.date] || 0) + e.amount;
  });

  function balanceAtDay(n: number): number {
    let bal = currentBalance;
    for (let d = 0; d <= n; d++) {
      const dateStr = toISO(addDays(today, d));
      bal += dailyDeltas[dateStr] || 0;
    }
    return bal;
  }

  function riskFor(balance: number): 'safe' | 'fragile' | 'danger' {
    if (balance < 0) return 'danger';
    if (balance < safetyReserve * 3) return 'fragile';
    return 'safe';
  }

  // Build milestones
  const milestonesDefs = [
    { label: "Aujourd'hui", days: 0 },
    { label: 'Dans 7 jours', days: 7 },
    { label: 'Dans 15 jours', days: 15 },
    { label: 'Dans 30 jours', days: 30 },
  ];

  const milestones: ProjectionMilestone[] = milestonesDefs.map(({ label, days }) => {
    const balance = balanceAtDay(days);
    return {
      label,
      date: toISO(addDays(today, days)),
      daysFromNow: days,
      balance,
      riskLevel: riskFor(balance),
    };
  });

  // Find lowest balance in the 30-day window
  let lowestBalance = currentBalance;
  let lowestDate = toISO(today);
  for (let d = 0; d <= 30; d++) {
    const bal = balanceAtDay(d);
    if (bal < lowestBalance) {
      lowestBalance = bal;
      lowestDate = toISO(addDays(today, d));
    }
  }

  return {
    milestones,
    events,
    lowestBalance,
    lowestDate,
    lowestDaysFromNow: daysFrom(today, lowestDate),
    safetyWarning: lowestBalance < safetyReserve,
  };
}
