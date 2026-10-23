export type CategoryId = string;
export type InvestmentAccountType = "government_bonds" | "brokerage" | "real_estate" | "other";
export type InvestmentHoldingKind = "udibono" | "etf" | "land" | "real_estate" | "other";
export type InvestmentIncomeFrequency = "monthly" | "quarterly" | "semiannual" | "annual" | "manual" | "none";
export type InvestmentIncomeType = "coupon" | "dividend" | "distribution" | "other";

export interface Category {
  id: CategoryId;
  name: string;
  icon: string;
  color: string;
}

export type PaymentMethod =
  | "cash"
  | "debit_card"
  | "credit_card"
  | "bank_transfer"
  | "other";

export interface Expense {
  id: string;
  amountMinor: number;
  currency: "MXN";
  merchant: string | null;
  categoryId: CategoryId;
  investmentAccountId?: string | null;
  investmentHoldingId?: string | null;
  expenseDate: string;
  paymentMethod: PaymentMethod | null;
  source: "manual" | "receipt";
  receiptPath: string | null;
  notes: string;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvestmentAccount {
  id: string;
  name: string;
  type: InvestmentAccountType;
  provider: string;
  notes: string;
  createdAt: Date;
}

export interface InvestmentValuation {
  id: string;
  accountId: string;
  valueMinor: number;
  valuationDate: string;
  createdAt: Date;
}

export interface InvestmentHolding {
  id: string;
  accountId: string;
  name: string;
  kind: InvestmentHoldingKind;
  ticker: string;
  currency: string;
  incomeFrequency: InvestmentIncomeFrequency;
  nextPaymentDate: string | null;
  amountInvestedMinor?: number;
  currentValueMinor?: number;
  currentValueDate?: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvestmentIncome {
  id: string;
  accountId: string;
  holdingId: string;
  type: InvestmentIncomeType;
  amountMinor: number;
  currency: string;
  expectedDate: string;
  receivedDate: string;
  reinvested: boolean;
  notes: string;
  createdAt: Date;
}

export interface Budget {
  id: string;
  month: string;
  categoryId: CategoryId | "overall";
  limitMinor: number;
  currency: "MXN";
  updatedAt: Date;
}

export interface ReceiptExtraction {
  merchant: string | null;
  expenseDate: string | null;
  amountMinor: number | null;
  categoryId: CategoryId;
  currency: string | null;
  warnings: string[];
  needsReview: boolean;
}

export interface Household {
  id: string;
  name: string;
  ownerUid: string;
  memberCount?: number;
  currency: "MXN";
}

export interface HouseholdMember {
  uid: string;
  displayName: string;
  email: string;
  role: "owner" | "member";
}
