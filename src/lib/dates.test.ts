import { describe, expect, it } from "vitest";
import { addMonths, isValidExpenseDate, localDateString, monthString } from "./dates";

describe("local calendar dates", () => {
  it("uses local date components rather than UTC conversion", () => {
    const local = new Date(2026, 0, 1, 0, 10);
    expect(localDateString(local)).toBe("2026-01-01");
    expect(monthString(local)).toBe("2026-01");
  });

  it("moves month boundaries and handles leap dates", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(isValidExpenseDate("2024-02-29")).toBe(true);
    expect(isValidExpenseDate("2025-02-29")).toBe(false);
    expect(isValidExpenseDate("2026-13-01")).toBe(false);
  });
});
