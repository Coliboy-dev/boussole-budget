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

function record(check: Check): Check {
  return (value, path) => {
    for (const [key, item] of Object.entries(asObject(value, path))) {
      identifier(key, path);
      check(item, `${path}.${key}`);
    }
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

export function isSpendingAmount(value: number): boolean {
  const cents = toCents(value);
  return Number.isSafeInteger(cents) && cents > 0 && fromCents(cents) === value;
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
// Toute nouvelle catégorie est d'abord LUE (cette liste) avant d'être PROPOSÉE à la saisie (lib/spending.ts) :
// une version plus ancienne de l'app refuserait un budget contenant une catégorie inconnue.
const spendingCategoryValues = ['groceries', 'restaurants', 'transport', 'health', 'leisure', 'clothing', 'home', 'children', 'cash',
  'pets', 'gifts', 'beauty', 'travel', 'other'] as const;
const spendingCategory = oneOf(...spendingCategoryValues);

const schedule = {
  endDate: optional(date),
  trackedFrom: optional(date),
  occurrenceStatuses: optional((value, path) => {
    for (const [day, entry] of Object.entries(asObject(value, path))) {
      if (!isLocalDate(day)) invalid(path);
      status(entry, `${path}.${day}`);
    }
  }),
  occurrenceAmountsCents: optional((value, path) => {
    for (const [day, cents] of Object.entries(asObject(value, path))) {
      if (!isLocalDate(day)) invalid(path);
      nonNegativeInteger(cents, `${path}.${day}`);
    }
  }),
};

function budgetCheck(unit: Unit): Check {
  const money = amount(unit);
  const spendingAmount = checkValue((value) => typeof value === 'number' && (
    unit === 'cents' ? value > 0 && isExactCents(value) : isSpendingAmount(value)
  ));
  const envelopeList = entities({ category: spendingCategory, label: text, monthlyAmount: money });

  return object({
    currentBalance: amount(unit, true),
    hasJointAccount: optional(flag),
    retiredHouseholdMovements: optional(record(nonNegativeInteger)),
    balanceDate: optional(date),
    balanceRevision: optional(nonNegativeInteger),
    envelopes: optional((value, path) => {
      envelopeList(value, path);
      const categories = (value as { category: string }[]).map(({ category }) => category);
      if (new Set(categories).size !== categories.length) {
        throw new Error(`Catégories en double dans « ${path} ».`);
      }
    }),
    spendings: optional(entities({
      date, amount: spendingAmount, category: oneOf(...spendingCategoryValues, 'household'), label: optional(text),
      balanceIncluded: flag, debited: flag, balanceRevision: nonNegativeInteger,
      paidFrom: optional(oneOf('personal')), paidBy: optional(identifier),
      linkedRecordId: optional(identifier), linkedRecordSeq: optional(nonNegativeInteger),
    })),
    balanceGaps: optional(entities({ fromDate: date, date, amount: amount(unit, true) })),
    merchantCategories: optional(record(spendingCategory)),
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
      type: oneOf('mutual_insurance', 'salary', 'allocation', 'alimony', 'freelance', 'other', 'household_contribution', 'household_transfer'),
      amount: money,
      frequency,
      expectedDate: optional(date),
      isConfirmed: flag,
      contributionMemberId: optional(identifier),
      linkedRecordId: optional(identifier), linkedRecordSeq: optional(nonNegativeInteger),
      linkedRevision: optional(identifier),
      balanceRevision: optional(nonNegativeInteger),
      notes: optional(text),
    }),
    expenses: entities({
      ...schedule,
      label: text,
      category: oneOf('rent', 'energy', 'phone', 'insurance', 'groceries', 'transport', 'health', 'school', 'subscriptions',
        'alimony', 'taxes', 'childcare', 'activities', 'other', 'household'),
      amount: money,
      frequency,
      dueDate: optional(date),
      isPaid: flag,
      isRecurring: flag,
      linkedRecordId: optional(identifier),
      linkedRecordSeq: optional(nonNegativeInteger),
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
    }),
    goals: entities({
      label: text,
      targetAmount: money,
      savedAmount: money,
      targetDate: optional(date),
      weeklyContribution: optional(money),
      monthlyContribution: optional(money),
      // Champs facultatifs : une version plus ancienne les ignore sans refuser le budget.
      onCurrentAccount: optional(flag),
      lastContributionMonth: optional(checkValue((value) => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value))),
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
