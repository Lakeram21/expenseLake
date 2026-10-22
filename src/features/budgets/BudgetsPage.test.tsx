import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import type { Household } from "../../types";

const mockedServices = vi.hoisted(() => ({
  createCategory: vi.fn(),
}));

vi.mock("../../services/categoryService", () => ({
  createCategory: mockedServices.createCategory,
}));

import BudgetsPage from "./BudgetsPage";
import { CATEGORIES } from "../../lib/categories";

const household: Household = { id: "home-1", name: "Casa", ownerUid: "user-1", currency: "MXN" };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("custom budget categories", () => {
  it("creates a household category from the budgets page", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    mockedServices.createCategory.mockResolvedValue(undefined);
    const actor = userEvent.setup();
    render(
      <BudgetsPage
        household={household}
        categories={CATEGORIES}
        user={{ uid: "user-1" } as User}
        month="2026-10"
        expenses={[]}
        budgets={[]}
        loading={false}
        onRefresh={onRefresh}
        onAddExpense={vi.fn()}
        onScanReceipt={vi.fn()}
        onEditExpense={vi.fn()}
      />,
    );

    await actor.type(screen.getByLabelText("Category name"), "Pets");
    await actor.click(screen.getByRole("button", { name: "Add category" }));

    await waitFor(() => expect(mockedServices.createCategory).toHaveBeenCalledWith("home-1", "Pets", "✳️"));
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});
