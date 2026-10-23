import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import type { Expense, Household, InvestmentAccount, InvestmentHolding } from "../../types";

const mockedServices = vi.hoisted(() => ({
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  validateReceiptFile: vi.fn(),
  extractReceiptFromImage: vi.fn(),
}));

vi.mock("../../services/expenseService", () => ({
  createExpense: mockedServices.createExpense,
  updateExpense: mockedServices.updateExpense,
}));

vi.mock("../../services/receiptService", () => ({
  validateReceiptFile: mockedServices.validateReceiptFile,
}));

vi.mock("../../services/receiptOcr", () => ({
  extractReceiptFromImage: mockedServices.extractReceiptFromImage,
}));

import ExpenseOverlay from "./ExpenseOverlay";

const household: Household = { id: "home-1", name: "Casa", ownerUid: "user-1", currency: "MXN" };
const user = { uid: "user-1", displayName: "Ana", email: "ana@example.com" } as User;
const investmentAccount: InvestmentAccount = {
  id: "cetes",
  name: "Cetesdirecto",
  type: "government_bonds",
  provider: "Cetesdirecto",
  notes: "",
  createdAt: new Date("2026-01-01"),
};
const investmentHolding: InvestmentHolding = {
  id: "etf-1",
  accountId: investmentAccount.id,
  name: "S&P 500 ETF",
  kind: "etf",
  ticker: "SP500",
  currency: "USD",
  incomeFrequency: "none",
  nextPaymentDate: null,
  amountInvestedMinor: 500000,
  currentValueMinor: 600000,
  currentValueDate: "2026-10-01",
  notes: "",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("expense entry", () => {
  it("creates a manual household expense with integer centavos", async () => {
    const onSaved = vi.fn();
    mockedServices.createExpense.mockResolvedValue("expense-1");
    const actor = userEvent.setup();
    render(<ExpenseOverlay household={household} user={user} receiptMode={false} expense={null} onClose={vi.fn()} onSaved={onSaved} />);

    await actor.type(screen.getByRole("textbox", { name: "Amount in pesos" }), "123.45");
    await actor.type(screen.getByPlaceholderText("Where did you spend?"), "Mercado");
    await actor.click(screen.getByRole("button", { name: /Save expense/ }));

    await waitFor(() => expect(mockedServices.createExpense).toHaveBeenCalledWith(
      "home-1",
      expect.objectContaining({
        amountMinor: 12345,
        merchant: "Mercado",
        categoryId: "groceries",
      }),
      { uid: "user-1", displayName: "Ana" },
    ));
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("updates only the selected expense when editing", async () => {
    const existing: Expense = {
      id: "expense-7",
      amountMinor: 5000,
      currency: "MXN",
      merchant: "Cafe",
      categoryId: "dining",
      expenseDate: "2026-10-22",
      paymentMethod: null,
      source: "manual",
      receiptPath: null,
      notes: "",
      createdBy: "user-1",
      createdByName: "Ana",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockedServices.updateExpense.mockResolvedValue(undefined);
    render(<ExpenseOverlay household={household} user={user} receiptMode={false} expense={existing} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Amount in pesos" }), { target: { value: "62.50" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await waitFor(() => expect(mockedServices.updateExpense).toHaveBeenCalledWith(
      "home-1",
      "expense-7",
      expect.objectContaining({ amountMinor: 6250, categoryId: "dining" }),
    ));
  });

  it("links an investment-category expense to the selected investment account", async () => {
    mockedServices.createExpense.mockResolvedValue("investment-expense");
    const actor = userEvent.setup();
    render(<ExpenseOverlay household={household} user={user} investmentAccounts={[investmentAccount]} receiptMode={false} expense={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await actor.type(screen.getByRole("textbox", { name: "Amount in pesos" }), "100.00");
    await actor.selectOptions(screen.getByLabelText("Category"), "investments");
    await actor.selectOptions(screen.getByLabelText("Investment account"), "cetes");
    await actor.click(screen.getByRole("button", { name: /Save expense/ }));

    await waitFor(() => expect(mockedServices.createExpense).toHaveBeenCalledWith(
      "home-1",
      expect.objectContaining({ categoryId: "investments", investmentAccountId: "cetes", amountMinor: 10000 }),
      { uid: "user-1", displayName: "Ana" },
    ));
  });

  it("links a contribution to an optional asset inside the selected account", async () => {
    mockedServices.createExpense.mockResolvedValue("investment-expense");
    const actor = userEvent.setup();
    render(<ExpenseOverlay
      household={household}
      user={user}
      investmentAccounts={[investmentAccount]}
      investmentHoldings={[investmentHolding]}
      receiptMode={false}
      expense={null}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />);

    await actor.type(screen.getByRole("textbox", { name: "Amount in pesos" }), "250");
    await actor.selectOptions(screen.getByLabelText("Category"), "investments");
    await actor.selectOptions(screen.getByLabelText("Investment account"), investmentAccount.id);
    await actor.selectOptions(screen.getByLabelText(/Portfolio asset/), investmentHolding.id);
    await actor.click(screen.getByRole("button", { name: /Save expense/ }));

    await waitFor(() => expect(mockedServices.createExpense).toHaveBeenCalledWith(
      household.id,
      expect.objectContaining({
        investmentAccountId: investmentAccount.id,
        investmentHoldingId: investmentHolding.id,
        amountMinor: 25000,
      }),
      { uid: user.uid, displayName: "Ana" },
    ));
  });

  it("can track an expense from another category as an investment contribution", async () => {
    mockedServices.createExpense.mockResolvedValue("linked-expense");
    const actor = userEvent.setup();
    render(<ExpenseOverlay household={household} user={user} investmentAccounts={[investmentAccount]} receiptMode={false} expense={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await actor.type(screen.getByRole("textbox", { name: "Amount in pesos" }), "50");
    await actor.click(screen.getByLabelText("Track this expense as an investment contribution"));
    await actor.selectOptions(screen.getByLabelText("Investment account"), "cetes");
    await actor.click(screen.getByRole("button", { name: /Save expense/ }));

    await waitFor(() => expect(mockedServices.createExpense).toHaveBeenCalledWith(
      "home-1",
      expect.objectContaining({ categoryId: "groceries", investmentAccountId: "cetes", amountMinor: 5000 }),
      { uid: "user-1", displayName: "Ana" },
    ));
  });

  it("extracts a receipt locally and saves only the reviewed expense details", async () => {
    const onSaved = vi.fn();
    mockedServices.extractReceiptFromImage.mockResolvedValue({
      amountMinor: 12345,
      merchant: "Mercado",
      expenseDate: "2026-10-22",
      categoryId: "groceries",
      currency: "MXN",
      warnings: [],
      needsReview: true,
    });
    mockedServices.createExpense.mockResolvedValue("expense-receipt-1");
    const { container } = render(<ExpenseOverlay household={household} user={user} receiptMode={true} expense={null} onClose={vi.fn()} onSaved={onSaved} />);

    const image = new File(["receipt"], "receipt.jpg", { type: "image/jpeg" });
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!fileInput) throw new Error("Receipt file input was not rendered.");
    fireEvent.change(fileInput, { target: { files: [image] } });

    await screen.findByRole("textbox", { name: "Extracted total in pesos" });
    expect(mockedServices.extractReceiptFromImage).toHaveBeenCalledWith(image, "user-1");
    expect(container.querySelector(".receipt-preview")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Confirm expense/ }));
    await waitFor(() => expect(mockedServices.createExpense).toHaveBeenCalledWith(
      "home-1",
      expect.objectContaining({
        amountMinor: 12345,
        merchant: "Mercado",
        source: "receipt",
        receiptPath: null,
      }),
      { uid: "user-1", displayName: "Ana" },
    ));
    expect(onSaved).toHaveBeenCalledOnce();
  });
});
