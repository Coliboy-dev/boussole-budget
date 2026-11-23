// User profile
export interface UserProfile {
  id: string;
  firstName: string;
  situation: 'separated' | 'single' | 'divorced' | 'other';
  hasChildren: boolean;
  numberOfChildren?: number;
  isInMediation: boolean;
  safetyReserve: number; // default 50€
  currency: string; // default 'EUR'
}

// Income types
export type IncomeType = 'mutual_insurance' | 'allocation' | 'alimony' | 'salary' | 'freelance' | 'other' | 'household_contribution' | 'household_transfer';
export type Frequency = 'monthly' | 'weekly' | 'bi_monthly' | 'quarterly' | 'annual' | 'one_time';

export type OccurrenceStatus = 'planned' | 'paid' | 'late' | 'cancelled';

export interface Schedule {
  endDate?: string;
  trackedFrom?: string;
  occurrenceStatuses?: Record<string, 'paid' | 'cancelled'>;
  occurrenceAmountsCents?: Record<string, number>;
}

export interface Income extends Schedule {
  id: string;
  label: string;
  type: IncomeType;
  amount: number;
  frequency: Frequency;
  expectedDate?: string; // ISO date
  isConfirmed: boolean;
  contributionMemberId?: string;
  linkedRecordId?: string;
  linkedRecordSeq?: number;
  linkedRevision?: string;
  balanceRevision?: number;
  notes?: string;
}

// Expense types
export type ExpenseCategory = 'rent' | 'energy' | 'phone' | 'insurance' | 'groceries' | 'transport' | 'health' | 'school' | 'subscriptions'
  | 'alimony' | 'taxes' | 'childcare' | 'activities' | 'other' | 'household';

export interface Expense extends Schedule {
  id: string;
  label: string;
  category: ExpenseCategory;
  amount: number;
  frequency: Frequency;
  dueDate?: string; // ISO date for next occurrence
  isPaid: boolean;
  isRecurring: boolean;
  linkedRecordId?: string;
  linkedRecordSeq?: number;
  notes?: string;
}

export type SpendingCategory = 'groceries' | 'restaurants' | 'transport' | 'health' | 'leisure'
  | 'clothing' | 'home' | 'children' | 'cash' | 'pets' | 'gifts' | 'beauty' | 'travel' | 'other';

export interface Envelope {
  id: string;
  category: SpendingCategory;
  label: string;
  monthlyAmount: number;
}

export interface Spending {
  id: string;
  date: string;
  amount: number;
  category: SpendingCategory | 'household';
  label?: string;
  balanceIncluded: boolean;
  debited: boolean;
  balanceRevision: number;
  paidFrom?: 'personal';
  paidBy?: string;
  linkedRecordId?: string;
  linkedRecordSeq?: number;
}

export interface BalanceGap {
  id: string;
  fromDate: string;
  date: string;
  amount: number;
}

// Debt types
export type DebtStatus = 'to_pay' | 'late' | 'contested' | 'in_mediation' | 'plan_accepted' | 'suspended' | 'completed';
export type DebtType = 'personal' | 'shared';

export interface Debt extends Schedule {
  id: string;
  creditor: string;
  type: DebtType;
  initialAmount: number;
  remainingAmount: number;
  monthlyPayment: number;
  status: DebtStatus;
  nextDueDate?: string; // ISO date
  notes?: string;
  isMediationIncluded: boolean;
}

// Mediation
export type MediationStepStatus = 'pending' | 'done' | 'in_progress' | 'cancelled';

export interface MediationStep {
  id: string;
  date: string; // ISO date
  title: string;
  description: string;
  status: MediationStepStatus;
  creditorName?: string;
  documentRequired?: string;
  notes?: string;
}

export interface MediationFile {
  mediatorName?: string;
  mediatorOrganization?: string;
  startDate?: string;
  nextAppointment?: string;
  status: 'not_started' | 'in_progress' | 'plan_proposed' | 'plan_accepted' | 'completed' | 'failed';
  steps: MediationStep[];
  questionsForMediator: string[];
  proposedPlan?: {
    totalAmount: number;
    monthlyPayment: number;
    duration: number; // months
    acceptedCreditors: string[];
    refusedCreditors: string[];
  };
}

// Child expenses
export type ChildExpenseStatus = 'paid' | 'pending' | 'reimbursed' | 'receipt_sent';
export type ChildExpenseCategory = 'school' | 'clothing' | 'activities' | 'health' | 'transport' | 'other';

export interface ChildExpense {
  id: string;
  childName?: string;
  label: string;
  category: ChildExpenseCategory;
  totalAmount: number;
  paidByUser: number;
  shareAmount: number; // amount to be shared / reimbursed
  status: ChildExpenseStatus;
  date: string; // ISO date
  reimbursementDate?: string;
  notes?: string;
  receiptSent: boolean;
}

// Goals
export type GoalStatus = 'realistic' | 'fragile' | 'to_postpone';

export interface Goal {
  id: string;
  label: string;
  targetAmount: number;
  savedAmount: number;
  targetDate?: string; // ISO date
  weeklyContribution?: number;
  monthlyContribution?: number;
  /** L'épargne reste sur le compte courant : elle fait partie du solde, Capiste la réserve. */
  onCurrentAccount?: boolean;
  /** Mois (AAAA-MM) de la dernière mise de côté indiquée avec « J'ai mis de côté ». */
  lastContributionMonth?: string;
  status: GoalStatus;
  notes?: string;
}

// Documents (mocked for MVP)
export type DocumentCategory = 'invoice' | 'letter' | 'payment_proof' | 'mediation' | 'income_proof' | 'child_related' | 'other';

export interface DocumentItem {
  id: string;
  label: string;
  category: DocumentCategory;
  date: string; // ISO date
  fileUrl?: string; // future
  notes?: string;
  isConfidential: boolean;
}

export interface DailyBalance {
  date: string;
  balance: number;
}

// Budget summary (computed)
export interface BudgetSummary {
  currentBalance: number;
  totalMonthlyIncome: number;
  totalMonthlyExpenses: number;
  totalMonthlyDebts: number;
  totalMonthlyEnvelopes: number;
  totalMonthlyChildExpenses: number;
  safetyReserve: number;
  trueAvailable: number; // vraiDisponible
  savingsCapacity: number;
  emptyBudget: boolean;
  riskLevel: 'safe' | 'fragile' | 'danger';
  availableForecast: {
    date: string;
    balance: number;
    causes: string[];
    horizon: number;
    dailyBalances: DailyBalance[];
    annualProvision: number;
    /** Épargne des objectifs gardée sur le compte courant, comprise dans reservedAmount. */
    goalSavings: number;
    /** Dont la mise de côté du mois en cours, pas encore faite. */
    goalThisMonth: number;
    reservedAmount: number;
    optimisticAvailable: number;
  };
}

// Advice
export interface AdviceItem {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'positive' | 'action';
  priority: number; // 1 = high
}

// Future Open Banking (architecture placeholder)
export interface FutureBankConnection {
  id: string;
  bankName: string;
  iban?: string;
  consentGiven: boolean;
  consentExpiresAt?: string; // ISO date
  lastSyncAt?: string; // ISO date
  provider?: 'gocardless' | 'powens' | 'tink' | 'bridge' | 'other';
  // FUTURE: actual connection not implemented in MVP
}

export interface FutureBankTransaction {
  id: string;
  bankConnectionId: string;
  date: string; // ISO date
  description: string;
  amount: number; // negative = debit
  category?: ExpenseCategory;
  matchedDebtId?: string;
  matchedExpenseId?: string;
  isRecognized: boolean;
  // FUTURE: not used in MVP, placeholder for PSD2/Open Banking integration
}

// Reminder
export interface Reminder {
  id: string;
  label: string;
  dueDate: string; // ISO date
  amount?: number;
  type: 'expense' | 'debt' | 'mediation' | 'child' | 'income';
  refId?: string;
  isUrgent: boolean;
  isLate?: boolean;
}
