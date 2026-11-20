import type { AppState } from './budget-state.ts';
import { isLocalDate } from './local-date.ts';
import { fromCents, toCents } from './money.ts';

type Check = (value: unknown, path: string) => void;
type Fields = Record<string, Check>;
type Unit = 'euros' | 'cents';

function invalid(path: string): never {
  throw new Error(`Valeur invalide dans « ${path} ».`);
}

function asObject(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(path);
  return value as Record<string, unknown>;
}

function object(fields: Fields): Check {
  return (value, path) => {
    const data = asObject(value, path);
    for (const [key, check] of Object.entries(fields)) {
      check(data[key], `${path}.${key}`);
    }
  };
}

function checkValue(test: (value: unknown) => boolean): Check {
  return (value, path) => {
    if (!test(value)) invalid(path);
  };
}

function optional(check: Check): Check {
  return (value, path) => {
    if (value !== undefined) check(value, path);
  };
}

function list(check: Check): Check {
  return (value, path) => {
    if (!Array.isArray(value)) invalid(path);
    value.forEach((item, index) => check(item, `${path}[${index}]`));
  };
}

function entities(fields: Fields): Check {
  const check = list(object({ id: identifier, ...fields }));
  return (value, path) => {
    check(value, path);
    const ids = (value as { id: string }[]).map(({ id }) => id);
    if (new Set(ids).size !== ids.length) throw new Error(`Identifiants en double dans « ${path} ».`);
  };
}

function oneOf(...values: string[]): Check {
  return checkValue((value) => typeof value === 'string' && values.includes(value));
}

const text = checkValue((value) => typeof value === 'string');
const identifier = checkValue((value) => typeof value === 'string' && value.trim().length > 0);
const flag = checkValue((value) => typeof value === 'boolean');
const nonNegativeInteger = checkValue((value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
const date = checkValue(isLocalDate);

function isExactCents(value: number): boolean {
  return Number.isSafeInteger(value) && toCents(fromCents(value)) === value;
}

export function isBudgetAmount(value: number): boolean {
  return Number.isFinite(value) && isExactCents(toCents(value));
}

export function isNonNegativeBudgetAmount(value: number): boolean {
  return value >= 0 && isBudgetAmount(value);
}

function amount(unit: Unit, allowNegative = false): Check {
  return checkValue((value) => {
    if (typeof value !== 'number') return false;
    if (unit === 'cents') return (allowNegative || value >= 0) && isExactCents(value);
    return allowNegative ? isBudgetAmount(value) : isNonNegativeBudgetAmount(value);
  });
}

const frequency = oneOf('monthly', 'weekly', 'bi_monthly', 'quarterly', 'annual', 'one_time');
const status = oneOf('paid', 'cancelled');

const schedule = {
  endDate: optional(date),
  trackedFrom: optional(date),
  occurrenceStatuses: optional((value, path) => {
    for (const [day, entry] of Object.entries(asObject(value, path))) {
      if (!isLocalDate(day)) invalid(path);
      status(entry, `${path}.${day}`);
    }
  }),
};

function budgetCheck(unit: Unit): Check {
  const money = amount(unit);
  return object({
    currentBalance: amount(unit, true),
    balanceDate: optional(date),
    userProfile: object({
      id: identifier,
      firstName: text,
      situation: oneOf('separated', 'single', 'divorced', 'other'),
      hasChildren: flag,
      numberOfChildren: optional(nonNegativeInteger),
      isInMediation: flag,
      safetyReserve: money,
      currency: identifier,
    }),
    incomes: entities({
      ...schedule,
      label: text,
      type: oneOf('mutual_insurance', 'salary', 'allocation', 'alimony', 'freelance', 'other'),
      amount: money,
      frequency,
      expectedDate: optional(date),
      isConfirmed: flag,
      notes: optional(text),
    }),
    expenses: entities({
      ...schedule,
      label: text,
      category: oneOf('rent', 'energy', 'phone', 'insurance', 'groceries', 'transport', 'health', 'school', 'subscriptions', 'other'),
      amount: money,
      frequency,
      dueDate: optional(date),
      isPaid: flag,
      isRecurring: flag,
      notes: optional(text),
    }),
    debts: entities({
      ...schedule,
      creditor: text,
      type: oneOf('personal', 'shared'),
      initialAmount: money,
      remainingAmount: money,
      monthlyPayment: money,
      status: oneOf('to_pay', 'late', 'contested', 'in_mediation', 'plan_accepted', 'suspended', 'completed'),
      nextDueDate: optional(date),
      isMediationIncluded: flag,
      notes: optional(text),
    }),
    childExpenses: entities({
      childName: optional(text),
      label: text,
      category: oneOf('school', 'clothing', 'activities', 'health', 'transport', 'other'),
      totalAmount: money,
      paidByUser: money,
      shareAmount: money,
      status: oneOf('paid', 'pending', 'reimbursed', 'receipt_sent'),
      date,
      reimbursementDate: optional(date),
      notes: optional(text),
      receiptSent: flag,
      receiptReference: optional(text),
    }),
    goals: entities({
      label: text,
      targetAmount: money,
      savedAmount: money,
      targetDate: optional(date),
      weeklyContribution: optional(money),
      monthlyContribution: optional(money),
      status: oneOf('realistic', 'fragile', 'to_postpone'),
      notes: optional(text),
    }),
    mediationFile: object({
      mediatorName: optional(text),
      mediatorOrganization: optional(text),
      startDate: optional(date),
      nextAppointment: optional(date),
      status: oneOf('not_started', 'in_progress', 'plan_proposed', 'plan_accepted', 'completed', 'failed'),
      steps: entities({
        date,
        title: text,
        description: text,
        status: oneOf('pending', 'done', 'in_progress', 'cancelled'),
        creditorName: optional(text),
        documentRequired: optional(text),
        notes: optional(text),
      }),
      questionsForMediator: list(text),
      proposedPlan: optional(object({
        totalAmount: money,
        monthlyPayment: money,
        duration: nonNegativeInteger,
        acceptedCreditors: list(text),
        refusedCreditors: list(text),
      })),
    }),
    documents: entities({
      label: text,
      category: oneOf('invoice', 'letter', 'payment_proof', 'mediation', 'income_proof', 'child_related', 'other'),
      date,
      fileUrl: optional(text),
      notes: optional(text),
      isConfidential: flag,
    }),
  });
}

const checks = { euros: budgetCheck('euros'), cents: budgetCheck('cents') };

export function assertBudgetState(value: unknown, unit: Unit): asserts value is AppState {
  checks[unit](value, 'budget');
}
