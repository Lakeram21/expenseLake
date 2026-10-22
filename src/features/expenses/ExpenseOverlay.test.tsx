import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import type { Expense, Household } from "../../types";

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
