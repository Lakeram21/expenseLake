import {
  collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { isValidExpenseDate } from "../lib/dates";
import { MAX_INVESTMENT_AMOUNT_MINOR } from "../lib/money";
import type {
  InvestmentAccount, InvestmentAccountType,
  InvestmentHolding, InvestmentHoldingKind, InvestmentIncome, InvestmentIncomeFrequency,
  InvestmentIncomeType, InvestmentValuation,
} from "../types";

function database() {
  if (!db) throw new Error("Firebase is not configured.");
  return db;
}

function householdCollection(householdId: string, name: string) {
  return collection(database(), "households", householdId, name);
}

async function linkedInvestmentRecords(householdId: string, accountId: string) {
  const firestore = database();
  const [expenses, holdings, valuations, income] = await Promise.all([
    getDocs(query(collection(firestore, "households", householdId, "expenses"), where("investmentAccountId", "==", accountId))),
    getDocs(query(collection(firestore, "households", householdId, "investmentHoldings"), where("accountId", "==", accountId))),
    getDocs(query(collection(firestore, "households", householdId, "investmentValuations"), where("accountId", "==", accountId))),
    getDocs(query(collection(firestore, "households", householdId, "investmentIncome"), where("accountId", "==", accountId))),
  ]);
  return { expenses: expenses.size, holdings: holdings.size, valuations: valuations.size, income: income.size };
}

export async function deleteInvestmentAccount(householdId: string, accountId: string): Promise<void> {
  const links = await linkedInvestmentRecords(householdId, accountId);
  const linkedDescriptions: [number, string][] = [
    [links.expenses, "contribution expense"],
    [links.holdings, "asset"],
    [links.valuations, "valuation"],
    [links.income, "income record"],
  ];
  const linkSummary = linkedDescriptions
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}${count === 1 ? "" : "s"}`)
    .join(", ");
  if (linkSummary) throw new Error(`Delete the linked ${linkSummary} before deleting this account.`);
  await deleteDoc(doc(database(), "households", householdId, "investmentAccounts", accountId));
}

export async function deleteInvestmentValuation(householdId: string, valuationId: string): Promise<void> {
  await deleteDoc(doc(database(), "households", householdId, "investmentValuations", valuationId));
}

export async function deleteInvestmentHolding(householdId: string, holdingId: string): Promise<void> {
  const linkedIncome = await getDocs(query(
    householdCollection(householdId, "investmentIncome"),
    where("holdingId", "==", holdingId),
  ));
  if (!linkedIncome.empty) {
    throw new Error(`Delete this asset's ${linkedIncome.size} income record${linkedIncome.size === 1 ? "" : "s"} first.`);
  }
  await deleteDoc(doc(database(), "households", householdId, "investmentHoldings", holdingId));
}

export async function deleteInvestmentIncome(householdId: string, incomeId: string): Promise<void> {
  await deleteDoc(doc(database(), "households", householdId, "investmentIncome", incomeId));
}

export async function listInvestmentAccounts(householdId: string): Promise<InvestmentAccount[]> {
  const snapshot = await getDocs(householdCollection(householdId, "investmentAccounts"));
  return snapshot.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      name: data.name,
      type: data.type,
      provider: data.provider,
      notes: data.notes,
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
    } as InvestmentAccount;
  });
}

export async function listInvestmentValuations(householdId: string): Promise<InvestmentValuation[]> {
  const snapshot = await getDocs(householdCollection(householdId, "investmentValuations"));
  return snapshot.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      accountId: data.accountId,
      valueMinor: data.valueMinor,
      valuationDate: data.valuationDate,
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
    } as InvestmentValuation;
  });
}

export async function createInvestmentAccount(
  householdId: string,
  input: { name: string; type: InvestmentAccountType; provider: string; notes: string },
): Promise<void> {
  const name = input.name.trim();
  const provider = input.provider.trim();
  const notes = input.notes.trim();
  if (name.length < 2 || name.length > 60) throw new Error("Account names must be between 2 and 60 characters.");
  if (provider.length > 60) throw new Error("Provider names must be 60 characters or fewer.");
  if (notes.length > 500) throw new Error("Notes must be 500 characters or fewer.");
  await setDoc(doc(householdCollection(householdId, "investmentAccounts")), {
    name,
    type: input.type,
    provider,
    notes,
    createdAt: serverTimestamp(),
  });
}

export async function recordInvestmentValuation(
  householdId: string,
  input: { accountId: string; valueMinor: number; valuationDate: string },
): Promise<void> {
  if (!input.accountId) throw new Error("Choose an investment account.");
  if (!Number.isSafeInteger(input.valueMinor) || input.valueMinor < 0 || input.valueMinor > MAX_INVESTMENT_AMOUNT_MINOR) {
    throw new Error("Enter a valid investment value.");
  }
  if (!isValidExpenseDate(input.valuationDate)) {
    throw new Error("Choose a valid valuation date.");
  }
  await setDoc(doc(householdCollection(householdId, "investmentValuations")), {
    ...input,
    createdAt: serverTimestamp(),
  });
}

export async function listInvestmentHoldings(householdId: string): Promise<InvestmentHolding[]> {
  const snapshot = await getDocs(householdCollection(householdId, "investmentHoldings"));
  return snapshot.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      accountId: data.accountId,
      name: data.name,
      kind: data.kind,
      ticker: data.ticker,
      currency: data.currency,
      incomeFrequency: data.incomeFrequency,
      nextPaymentDate: data.nextPaymentDate,
      amountInvestedMinor: data.amountInvestedMinor,
      currentValueMinor: data.currentValueMinor,
      currentValueDate: data.currentValueDate,
      notes: data.notes,
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
      updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
    } as InvestmentHolding;
  });
}

export async function listInvestmentIncome(householdId: string): Promise<InvestmentIncome[]> {
  const snapshot = await getDocs(householdCollection(householdId, "investmentIncome"));
  return snapshot.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      accountId: data.accountId,
      holdingId: data.holdingId,
      type: data.type,
      amountMinor: data.amountMinor,
      currency: data.currency,
      expectedDate: data.expectedDate,
      receivedDate: data.receivedDate,
      reinvested: data.reinvested,
      notes: data.notes,
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
    } as InvestmentIncome;
  });
}

export async function createInvestmentHolding(
  householdId: string,
  input: {
    accountId: string;
    name: string;
    kind: InvestmentHoldingKind;
    ticker: string;
    currency: string;
    incomeFrequency: InvestmentIncomeFrequency;
    nextPaymentDate: string | null;
    amountInvestedMinor: number;
    currentValueMinor: number;
    currentValueDate: string;
    notes: string;
  },
): Promise<void> {
  const name = input.name.trim();
  const ticker = input.ticker.trim().toUpperCase();
  const currency = input.currency.trim().toUpperCase();
  const notes = input.notes.trim();
  if (!input.accountId) throw new Error("Choose an investment account.");
  if (name.length < 2 || name.length > 80) throw new Error("Holding names must be between 2 and 80 characters.");
  if (ticker.length > 15) throw new Error("Ticker must be 15 characters or fewer.");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Enter a three-letter currency code such as MXN or USD.");
  if (notes.length > 500) throw new Error("Notes must be 500 characters or fewer.");
  for (const [label, amount] of [
    ["amount invested", input.amountInvestedMinor],
    ["current value", input.currentValueMinor],
  ] as const) {
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_INVESTMENT_AMOUNT_MINOR) {
      throw new Error(`Enter a valid ${label}.`);
    }
  }
  if (!isValidExpenseDate(input.currentValueDate)) throw new Error("Choose a valid value date.");
  const incomeFrequency = input.kind === "udibono" ? "semiannual" : input.incomeFrequency;
  if (incomeFrequency !== "none" && (!input.nextPaymentDate || !isValidExpenseDate(input.nextPaymentDate))) {
    throw new Error("Choose the next expected payment date.");
  }
  if (input.kind === "udibono" && !input.nextPaymentDate) {
    throw new Error("Enter the next coupon date for this Udibono.");
  }
  if (input.nextPaymentDate && !isValidExpenseDate(input.nextPaymentDate)) {
    throw new Error("Choose a valid next payment date.");
  }
  await setDoc(doc(householdCollection(householdId, "investmentHoldings")), {
    ...input,
    incomeFrequency,
    name,
    ticker,
    currency,
    nextPaymentDate: incomeFrequency === "none" ? null : input.nextPaymentDate,
    notes,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateInvestmentHoldingValue(
  householdId: string,
  holding: InvestmentHolding,
  input: { currentValueMinor: number; currentValueDate: string },
): Promise<void> {
  if (!Number.isSafeInteger(input.currentValueMinor)
    || input.currentValueMinor < 0
    || input.currentValueMinor > MAX_INVESTMENT_AMOUNT_MINOR) {
    throw new Error("Enter a valid investment value.");
  }
  if (!isValidExpenseDate(input.currentValueDate)) throw new Error("Choose a valid value date.");
  await updateDoc(doc(database(), "households", householdId, "investmentHoldings", holding.id), {
    currentValueMinor: input.currentValueMinor,
    currentValueDate: input.currentValueDate,
    updatedAt: serverTimestamp(),
  });
}

export async function updateInvestmentHoldingSchedule(
  householdId: string,
  holding: InvestmentHolding,
  input: { incomeFrequency: InvestmentIncomeFrequency; nextPaymentDate: string | null },
): Promise<void> {
  if (holding.kind === "udibono" && input.incomeFrequency !== "semiannual") {
    throw new Error("Udibonos use a six-month coupon reminder cadence.");
  }
  if (input.incomeFrequency !== "none" && (!input.nextPaymentDate || !isValidExpenseDate(input.nextPaymentDate))) {
    throw new Error("Choose the next expected payment date.");
  }
  if (input.nextPaymentDate && !isValidExpenseDate(input.nextPaymentDate)) {
    throw new Error("Choose a valid next payment date.");
  }
  await updateDoc(doc(database(), "households", householdId, "investmentHoldings", holding.id), {
    incomeFrequency: input.incomeFrequency,
    nextPaymentDate: input.incomeFrequency === "none" ? null : input.nextPaymentDate,
    updatedAt: serverTimestamp(),
  });
}

export async function recordInvestmentIncome(
  householdId: string,
  holding: InvestmentHolding,
  input: {
    amountMinor: number;
    currency: string;
    expectedDate: string;
    receivedDate: string;
    type: InvestmentIncomeType;
    reinvested: boolean;
    notes: string;
  },
): Promise<void> {
  const currency = input.currency.trim().toUpperCase();
  const notes = input.notes.trim();
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0 || input.amountMinor > MAX_INVESTMENT_AMOUNT_MINOR) {
    throw new Error("Enter a valid payment amount.");
  }
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Enter a three-letter currency code such as MXN or USD.");
  if (!isValidExpenseDate(input.expectedDate) || !isValidExpenseDate(input.receivedDate)) {
    throw new Error("Choose valid expected and received dates.");
  }
  if (notes.length > 500) throw new Error("Notes must be 500 characters or fewer.");

  const firestore = database();
  const batch = writeBatch(firestore);
  const incomeRef = doc(householdCollection(householdId, "investmentIncome"));
  batch.set(incomeRef, {
    accountId: holding.accountId,
    holdingId: holding.id,
    type: input.type,
    amountMinor: input.amountMinor,
    currency,
    expectedDate: input.expectedDate,
    receivedDate: input.receivedDate,
    reinvested: input.reinvested,
    notes,
    createdAt: serverTimestamp(),
  });
  const nextPaymentDate = nextPaymentDateAfter(holding, input.expectedDate);
  batch.update(doc(firestore, "households", householdId, "investmentHoldings", holding.id), {
    nextPaymentDate,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export function nextPaymentDateAfter(
  holding: Pick<InvestmentHolding, "incomeFrequency">,
  paymentDate: string,
): string | null {
  const monthsByFrequency: Partial<Record<InvestmentIncomeFrequency, number>> = {
    monthly: 1,
    quarterly: 3,
    semiannual: 6,
    annual: 12,
  };
  const months = monthsByFrequency[holding.incomeFrequency];
  if (!months) return null;
  const [year, month, day] = paymentDate.split("-").map(Number);
  const targetMonth = month - 1 + months;
  const targetFirst = new Date(year, targetMonth, 1);
  const lastDay = new Date(targetFirst.getFullYear(), targetFirst.getMonth() + 1, 0).getDate();
  return `${targetFirst.getFullYear()}-${String(targetFirst.getMonth() + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}
