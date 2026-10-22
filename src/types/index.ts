export type CategoryId = string;

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
