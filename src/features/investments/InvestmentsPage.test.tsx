import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import type { InvestmentAccount, InvestmentHolding, Household } from "../../types";

const mockedServices = vi.hoisted(() => ({
  createInvestmentHolding: vi.fn(),
  deleteInvestmentAccount: vi.fn(),
  deleteInvestmentHolding: vi.fn(),
  deleteInvestmentIncome: vi.fn(),
  deleteInvestmentValuation: vi.fn(),
  recordInvestmentIncome: vi.fn(),
  updateInvestmentHoldingValue: vi.fn(),
}));
const mockedExpenseService = vi.hoisted(() => ({
  deleteExpense: vi.fn(),
}));

vi.mock("../../services/investmentService", () => ({
  createInvestmentAccount: vi.fn(),
  createInvestmentHolding: mockedServices.createInvestmentHolding,
  deleteInvestmentAccount: mockedServices.deleteInvestmentAccount,
  deleteInvestmentHolding: mockedServices.deleteInvestmentHolding,
  deleteInvestmentIncome: mockedServices.deleteInvestmentIncome,
  deleteInvestmentValuation: mockedServices.deleteInvestmentValuation,
  recordInvestmentIncome: mockedServices.recordInvestmentIncome,
  recordInvestmentValuation: vi.fn(),
  updateInvestmentHoldingSchedule: vi.fn(),
  updateInvestmentHoldingValue: mockedServices.updateInvestmentHoldingValue,
}));
vi.mock("../../services/expenseService", () => ({
  deleteExpense: mockedExpenseService.deleteExpense,
}));

import InvestmentsPage from "./InvestmentsPage";

const household: Household = { id: "home-1", name: "Casa", ownerUid: "user-1", currency: "MXN" };
const user = { uid: "user-1", displayName: "Ana" } as User;
const account: InvestmentAccount = {
  id: "cetes",
  name: "Cetesdirecto",
  type: "government_bonds",
  provider: "Cetesdirecto",
  notes: "",
  createdAt: new Date("2026-01-01"),
};
const holding: InvestmentHolding = {
  id: "udibono-2031",
  accountId: account.id,
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("investment income reminders", () => {
  it("shows an MXN asset's value with linked contributions included, without listing them separately", () => {
    const asset: InvestmentHolding = {
      ...holding,
      amountInvestedMinor: 1000000,
      currentValueMinor: 1000000,
      currentValueDate: "2026-10-01",
    };
    const contribution = {
      id: "contribution-1",
      amountMinor: 540000,
      currency: "MXN" as const,
      merchant: "ETF purchase",
      categoryId: "investments",
      investmentAccountId: account.id,
      investmentHoldingId: asset.id,
      expenseDate: "2026-10-10",
      paymentMethod: null,
      source: "manual" as const,
      receiptPath: null,
      notes: "",
      createdBy: user.uid,
      createdByName: "Ana",
      createdAt: new Date("2026-10-10"),
      updatedAt: new Date("2026-10-10"),
    };

    render(<InvestmentsPage
      household={household}
      user={user}
      expenses={[contribution]}
      investmentAccounts={[account]}
      investmentHoldings={[asset]}
      investmentIncome={[]}
      investmentValuations={[]}
      categories={[]}
      onRefresh={vi.fn().mockResolvedValue(undefined)}
      onAddExpense={vi.fn()}
      onEditExpense={vi.fn()}
    />);

    expect(screen.getByText(/Total value:.*15,400/)).toBeTruthy();
    expect(screen.queryByText(/Linked contributions:/)).toBeNull();
  });

  it("shows a scheduled coupon and records its actual amount separately as income", async () => {
    mockedServices.recordInvestmentIncome.mockResolvedValue(undefined);
    const actor = userEvent.setup();
    render(<InvestmentsPage
      household={household}
      user={user}
      expenses={[]}
      investmentAccounts={[account]}
      investmentHoldings={[holding]}
      investmentIncome={[]}
      investmentValuations={[]}
      categories={[]}
      onRefresh={vi.fn().mockResolvedValue(undefined)}
      onAddExpense={vi.fn()}
      onEditExpense={vi.fn()}
    />);

    expect(screen.getByText(new Intl.DateTimeFormat("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(`${holding.nextPaymentDate}T12:00:00`)))).toBeTruthy();
    await actor.click(screen.getByRole("button", { name: "Record income" }));
    await actor.type(screen.getByLabelText("Amount received"), "123.45");
    await actor.click(screen.getByLabelText("Reinvested instead of paid out as cash"));
    await actor.click(screen.getByRole("button", { name: "Record payment" }));

    await waitFor(() => expect(mockedServices.recordInvestmentIncome).toHaveBeenCalledWith(
      household.id,
      holding,
      expect.objectContaining({
        amountMinor: 12345,
        currency: "MXN",
        expectedDate: holding.nextPaymentDate,
        type: "coupon",
        reinvested: true,
      }),
    ));
  });

  it("creates a land asset with its own invested amount and current value and no payment schedule", async () => {
    mockedServices.createInvestmentHolding.mockResolvedValue(undefined);
    const actor = userEvent.setup();
    render(<InvestmentsPage
      household={household}
      user={user}
      expenses={[]}
      investmentAccounts={[account]}
      investmentHoldings={[]}
      investmentIncome={[]}
      investmentValuations={[]}
      categories={[]}
      onRefresh={vi.fn().mockResolvedValue(undefined)}
      onAddExpense={vi.fn()}
      onEditExpense={vi.fn()}
    />);

    await actor.click(screen.getByRole("button", { name: "Add holding" }));
    await actor.type(screen.getByLabelText("Asset name"), "Parcel 4");
    await actor.selectOptions(screen.getByLabelText("Asset type"), "land");
    await actor.type(screen.getByLabelText("Amount invested"), "250000");
    await actor.type(screen.getByLabelText("Current value before contributions"), "300000");
    await actor.click(screen.getByRole("button", { name: "Save asset" }));

    await waitFor(() => expect(mockedServices.createInvestmentHolding).toHaveBeenCalledWith(
      household.id,
      expect.objectContaining({
        accountId: account.id,
        name: "Parcel 4",
        kind: "land",
        amountInvestedMinor: 25000000,
        currentValueMinor: 30000000,
        currentValueDate: expect.any(String),
        incomeFrequency: "none",
        nextPaymentDate: null,
      }),
    ));
  });

  it("updates an asset's individually tracked value and valuation date", async () => {
    mockedServices.updateInvestmentHoldingValue.mockResolvedValue(undefined);
    const actor = userEvent.setup();
    const asset: InvestmentHolding = {
      ...holding,
      kind: "land",
      incomeFrequency: "none",
      nextPaymentDate: null,
      amountInvestedMinor: 25000000,
      currentValueMinor: 30000000,
      currentValueDate: "2026-01-01",
    };
    render(<InvestmentsPage
      household={household}
      user={user}
      expenses={[]}
      investmentAccounts={[account]}
      investmentHoldings={[asset]}
      investmentIncome={[]}
      investmentValuations={[]}
      categories={[]}
      onRefresh={vi.fn().mockResolvedValue(undefined)}
      onAddExpense={vi.fn()}
      onEditExpense={vi.fn()}
    />);

    await actor.click(screen.getByRole("button", { name: "Update value for Udibono 2031" }));
    const valueInput = screen.getByLabelText("Current value before contributions");
    await actor.clear(valueInput);
    await actor.type(valueInput, "325000");
    await actor.click(screen.getByRole("button", { name: "Save value" }));

    await waitFor(() => expect(mockedServices.updateInvestmentHoldingValue).toHaveBeenCalledWith(
      household.id,
      asset,
      { currentValueMinor: 32500000, currentValueDate: expect.any(String) },
    ));
  });

  it("blocks deleting accounts and assets while linked records still exist", () => {
    const coupon = {
      id: "coupon-1",
      accountId: account.id,
      holdingId: holding.id,
      type: "coupon" as const,
      amountMinor: 12000,
      currency: "MXN",
      expectedDate: holding.nextPaymentDate ?? "2026-10-23",
      receivedDate: "2026-10-23",
      reinvested: false,
      notes: "",
      createdAt: new Date("2026-10-23"),
    };
    render(<InvestmentsPage
      household={household}
      user={user}
      expenses={[]}
      investmentAccounts={[account]}
      investmentHoldings={[holding]}
      investmentIncome={[coupon]}
      investmentValuations={[]}
      categories={[]}
      onRefresh={vi.fn().mockResolvedValue(undefined)}
      onAddExpense={vi.fn()}
      onEditExpense={vi.fn()}
    />);

    expect(screen.getByRole("button", { name: "Delete account" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: `Delete asset ${holding.name}` }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: `Delete income record for ${holding.name}` }).hasAttribute("disabled")).toBe(false);
  });

  it("deletes a contribution through its linked household expense", async () => {
    mockedExpenseService.deleteExpense.mockResolvedValue(undefined);
    vi.stubGlobal("confirm", vi.fn(() => true));
    const actor = userEvent.setup();
    const contribution = {
      id: "expense-1",
      amountMinor: 32000,
      currency: "MXN" as const,
      merchant: "Investment transfer",
      categoryId: "investments",
      investmentAccountId: account.id,
      expenseDate: "2026-10-23",
      paymentMethod: "bank_transfer" as const,
      source: "manual" as const,
      receiptPath: null,
      notes: "",
      createdBy: user.uid,
      createdByName: "Ana",
      createdAt: new Date("2026-10-23"),
      updatedAt: new Date("2026-10-23"),
    };
    render(<InvestmentsPage
      household={household}
      user={user}
      expenses={[contribution]}
      investmentAccounts={[account]}
      investmentHoldings={[]}
      investmentIncome={[]}
      investmentValuations={[]}
      categories={[]}
      onRefresh={vi.fn().mockResolvedValue(undefined)}
      onAddExpense={vi.fn()}
      onEditExpense={vi.fn()}
    />);

    await actor.click(screen.getByRole("button", { name: "Options for Investment transfer" }));
    await actor.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mockedExpenseService.deleteExpense).toHaveBeenCalledWith(household.id, contribution.id));
  });

  it("shows unscheduled holdings so they can still record irregular ETF income", async () => {
    const etf: InvestmentHolding = {
      ...holding,
      id: "etf-1",
      name: "Distributing ETF",
      kind: "etf",
      ticker: "FUND",
      currency: "USD",
      incomeFrequency: "none",
      nextPaymentDate: null,
    };
    render(<InvestmentsPage
      household={household}
      user={user}
      expenses={[]}
      investmentAccounts={[account]}
      investmentHoldings={[etf]}
      investmentIncome={[]}
      investmentValuations={[]}
      categories={[]}
      onRefresh={vi.fn().mockResolvedValue(undefined)}
      onAddExpense={vi.fn()}
      onEditExpense={vi.fn()}
    />);

    expect(screen.getByText("No date set")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Record income" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Record income" }));
    expect(screen.getAllByText(/Distributing ETF/).length).toBeGreaterThan(1);
  });
});
