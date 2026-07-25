import { describe, expect, it } from "vitest";

import {
  applyDiscount,
  calculateInvoiceTotals,
  calculateRefund,
  reconcileCash,
} from "@/features/finance/money";

describe("finance money", () => {
  it("keeps every calculation in integer GBP minor units", () => {
    expect(calculateInvoiceTotals([
      { description: "Season fee", quantity: 1, unitAmountPence: 12_500 },
      { description: "Sibling training", quantity: 2, unitAmountPence: 2_750 },
    ])).toEqual({ subtotalPence: 18_000, discountPence: 0, totalPence: 18_000, currency: "GBP" });
  });

  it("rejects zero-quantity and fractional invoice lines", () => {
    expect(() => calculateInvoiceTotals([{ description: "Invalid", quantity: 0, unitAmountPence: 100 }])).toThrow(/quantity/i);
    expect(() => calculateInvoiceTotals([{ description: "Invalid", quantity: 1, unitAmountPence: 10.5 }])).toThrow(/unit amount/i);
  });

  it("caps percentage and fixed discounts at the subtotal", () => {
    expect(applyDiscount(10_000, { kind: "percentage", value: 15 })).toBe(1_500);
    expect(applyDiscount(1_000, { kind: "fixed", value: 1_500 })).toBe(1_000);
  });

  it("prevents refunds beyond the settled balance", () => {
    expect(calculateRefund({ paidPence: 8_000, previouslyRefundedPence: 1_500, requestedPence: 6_500 })).toBe(6_500);
    expect(() => calculateRefund({ paidPence: 8_000, previouslyRefundedPence: 1_500, requestedPence: 6_501 })).toThrow(/refundable balance/i);
  });

  it("reports cash reconciliation variance without changing the count", () => {
    expect(reconcileCash({ expectedPence: 4_500, countedPence: 4_420 })).toEqual({
      expectedPence: 4_500,
      countedPence: 4_420,
      variancePence: -80,
      status: "variance",
    });
  });
});
