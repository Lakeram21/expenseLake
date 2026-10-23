import { describe, expect, it } from "vitest";
import type {
  Expense, InvestmentAccount, InvestmentHolding, InvestmentIncome, InvestmentValuation,
} from "../types";
import {
  incomeTotalsByCurrency, investmentReminders, investmentTotals, latestValuationsByAccount,
} from "./investments";
import { nextPaymentDateAfter } from "../services/investmentService";

const account: InvestmentAccount = {
  id: "gbm",
  name: "GBM",
  type: "brokerage",
  provider: "GBM",
  notes: "",
  createdAt: new Date("2026-01-01"),
};

function expense(id: string, amountMinor: number, expenseDate: string, investmentAccountId: string | null): Expense {
  return {
    id,
    amountMinor,
    currency: "MXN",
    merchant: "Transfer",
    categoryId: investmentAccountId ? "investments" : "other",
    investmentAccountId,
    expenseDate,
    paymentMethod: null,
    source: "manual",
    receiptPath: null,
    notes: "",
    createdBy: "user-1",
    createdByName: "Member",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

function valuation(id: string, accountId: string, valueMinor: number, valuationDate: string): InvestmentValuation {
  return { id, accountId, valueMinor, valuationDate, createdAt: new Date(`${valuationDate}T12:00:00`) };
}

const udibono: InvestmentHolding = {
  id: "udibono-lot",
  accountId: "cetes",
  name: "Udibono 2031",
  kind: "udibono",
  ticker: "",
  currency: "MXN",
  incomeFrequency: "semiannual",
  nextPaymentDate: "2026-10-23",
  notes: "",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

describe("investment totals", () => {
  it("adds all account contributions to the latest account valuation", () => {
    const expenses = [
      expense("old-contribution", 20000, "2025-03-12", "gbm"),
      expense("recent-contribution", 5000, "2026-10-02", "gbm"),
      expense("regular-expense", 9000, "2026-10-03", null),
    ];
    const valuations = [
      valuation("old-value", "gbm", 23000, "2026-01-01"),
      valuation("latest-value", "gbm", 28000, "2026-10-10"),
    ];

    expect(investmentTotals(expenses, [account], valuations)).toMatchObject({
      currentValueMinor: 53000,
      contributedMinor: 25000,
    });
    expect(investmentTotals(expenses, [account], valuations, "2026-10")).toMatchObject({
      currentValueMinor: 53000,
      contributedMinor: 5000,
    });
  });

  it("chooses the newest valuation and ignores expenses linked to unknown accounts", () => {
    const olderOnDate = valuation("first", "gbm", 100, "2026-10-01");
    const newerOnDate = { ...olderOnDate, id: "second", valueMinor: 200, createdAt: new Date("2026-10-01T13:00:00") };
    expect(latestValuationsByAccount([olderOnDate, newerOnDate]).get("gbm")).toBe(newerOnDate);

    const totals = investmentTotals([expense("unknown", 4000, "2026-10-01", "missing")], [account], []);
    expect(totals.contributedMinor).toBe(0);
  });

  it("uses contributions as the tracked total until a valuation is recorded", () => {
    const expenses = [
      expense("first", 20000, "2026-01-10", "gbm"),
      expense("second", 5000, "2026-10-02", "gbm"),
    ];
    expect(investmentTotals(expenses, [account], [])).toMatchObject({
      currentValueMinor: 25000,
      contributedMinor: 25000,
      currentValueByAccount: new Map([["gbm", 25000]]),
    });
    expect(investmentTotals(expenses, [account], [], "2026-10")).toMatchObject({
      currentValueMinor: 25000,
      contributedMinor: 5000,
    });
  });

  it("adds all contributions and only post-valuation reinvested MXN income", () => {
    const expenses = [
      expense("before", 5000, "2026-10-01", "gbm"),
      expense("after", 2000, "2026-10-12", "gbm"),
    ];
    const payment = (
      id: string,
      receivedDate: string,
      amountMinor: number,
      currency: string,
      reinvested: boolean,
    ): InvestmentIncome => ({
      id,
      accountId: "gbm",
      holdingId: "etf",
      type: "dividend",
      amountMinor,
      currency,
      expectedDate: receivedDate,
      receivedDate,
      reinvested,
      notes: "",
      createdAt: new Date(`${receivedDate}T12:00:00`),
    });
    const income = [
      payment("before-valuation", "2026-10-02", 1000, "MXN", true),
      payment("reinvested", "2026-10-12", 1500, "MXN", true),
      payment("cash", "2026-10-13", 700, "MXN", false),
      payment("foreign", "2026-10-14", 500, "USD", true),
    ];

    expect(investmentTotals(expenses, [account], [
      valuation("snapshot", "gbm", 50000, "2026-10-10"),
    ], undefined, income)).toMatchObject({
      currentValueMinor: 58500,
      contributedMinor: 7000,
      currentValueByAccount: new Map([["gbm", 58500]]),
    });
  });

  it("tracks individual asset values by currency without combining foreign amounts into MXN", () => {
    const etf = {
      ...udibono,
      id: "etf",
      accountId: account.id,
      kind: "etf" as const,
      currency: "USD",
      amountInvestedMinor: 100000,
      currentValueMinor: 125000,
      currentValueDate: "2026-10-01",
    };
    const land = {
      ...udibono,
      id: "land",
      accountId: account.id,
      kind: "land" as const,
      incomeFrequency: "none" as const,
      nextPaymentDate: null,
      amountInvestedMinor: 2000000,
      currentValueMinor: 2500000,
      currentValueDate: "2026-10-01",
    };
    const totals = investmentTotals(
      [expense("contribution", 32000, "2026-10-02", account.id)],
      [account],
      [valuation("account-value", account.id, 3000000, "2026-10-01")],
      undefined,
      [],
      [etf, land],
    );

    expect(totals.currentValueMinor).toBe(2532000);
    expect(totals.currentValueByCurrency).toEqual(new Map([["USD", 125000], ["MXN", 2532000]]));
  });

  it("adds asset-linked and account-only contributions to the current asset value", () => {
    const asset = {
      ...udibono,
      accountId: account.id,
      currentValueMinor: 100000,
      currentValueDate: "2026-10-10",
      amountInvestedMinor: 90000,
    };
    const expenses = [
      { ...expense("before", 20000, "2026-10-09", account.id), investmentHoldingId: asset.id },
      { ...expense("after", 5000, "2026-10-11", account.id), investmentHoldingId: asset.id },
      expense("general", 3000, "2026-10-12", account.id),
    ];
    const totals = investmentTotals(expenses, [account], [], undefined, [], [asset]);

    expect(totals.currentValueMinor).toBe(128000);
    expect(totals.contributedMinor).toBe(28000);
    expect(totals.contributionsByHolding.get(asset.id)).toBe(25000);
  });

  it("adds linked contributions even when the recorded asset value date is later", () => {
    const asset = {
      ...udibono,
      accountId: account.id,
      currentValueMinor: 1000000,
      currentValueDate: "2026-10-20",
    };
    const totals = investmentTotals([
      { ...expense("linked", 500000, "2026-10-12", account.id), investmentHoldingId: asset.id },
    ], [account], [], undefined, [], [asset]);

    expect(totals.currentValueMinor).toBe(1500000);
    expect(totals.currentValueByAccount.get(account.id)).toBe(1500000);
  });

  it("falls back to initial invested amount plus linked contributions when an asset has no value", () => {
    const asset = {
      ...udibono,
      accountId: account.id,
      amountInvestedMinor: 90000,
      currentValueMinor: undefined,
      currentValueDate: undefined,
    };
    const totals = investmentTotals([
      { ...expense("linked", 5000, "2026-10-11", account.id), investmentHoldingId: asset.id },
    ], [account], [], undefined, [], [asset]);

    expect(totals.currentValueMinor).toBe(95000);
    expect(totals.contributionsByHolding.get(asset.id)).toBe(5000);
  });

  it("keeps the account-level valuation as the portfolio baseline until every asset has a value", () => {
    const valuedAsset = {
      ...udibono,
      accountId: account.id,
      currentValueMinor: 20000,
      amountInvestedMinor: 18000,
      currentValueDate: "2026-10-10",
    };
    const legacyAsset = { ...udibono, id: "legacy", accountId: account.id };

    expect(investmentTotals(
      [expense("contribution", 3000, "2026-10-12", account.id)],
      [account],
      [valuation("account", account.id, 50000, "2026-10-10")],
      undefined,
      [],
      [valuedAsset, legacyAsset],
    )).toMatchObject({
      currentValueMinor: 53000,
      currentValueByAccount: new Map([[account.id, 53000]]),
    });
  });
});

describe("investment income tracking", () => {
  it("advances recurring coupon schedules without overflowing month-end dates", () => {
    expect(nextPaymentDateAfter(udibono, "2026-10-23")).toBe("2027-04-23");
    expect(nextPaymentDateAfter({ incomeFrequency: "monthly" }, "2026-01-31")).toBe("2026-02-28");
    expect(nextPaymentDateAfter({ incomeFrequency: "manual" }, "2026-10-23")).toBeNull();
    expect(nextPaymentDateAfter({ incomeFrequency: "none" }, "2026-10-23")).toBeNull();
  });

  it("identifies overdue and upcoming reminders from the entered due date", () => {
    const overdue = { ...udibono, id: "overdue", nextPaymentDate: "2026-10-01" };
    const upcoming = { ...udibono, id: "upcoming", nextPaymentDate: "2026-11-01" };
    const noSchedule = { ...udibono, id: "none", incomeFrequency: "none" as const, nextPaymentDate: null };

    expect(investmentReminders([upcoming, noSchedule, overdue], "2026-10-23")).toEqual([
      { holding: overdue, status: "overdue" },
      { holding: upcoming, status: "coming soon" },
    ]);
  });

  it("keeps payment totals separated by original currency", () => {
    const payment = (id: string, currency: string, amountMinor: number): InvestmentIncome => ({
      id,
      accountId: "cetes",
      holdingId: "udibono-lot",
      type: "coupon",
      amountMinor,
      currency,
      expectedDate: "2026-10-23",
      receivedDate: "2026-10-23",
      reinvested: false,
      notes: "",
      createdAt: new Date("2026-10-23"),
    });
    expect(incomeTotalsByCurrency([
      payment("a", "MXN", 10000),
      payment("b", "MXN", 2500),
      payment("c", "USD", 500),
    ])).toEqual(new Map([["MXN", 12500], ["USD", 500]]));
  });
});
