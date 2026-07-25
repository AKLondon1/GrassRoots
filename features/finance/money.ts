export interface InvoiceLine {
  description: string;
  quantity: number;
  unitAmountPence: number;
}

export type Discount =
  | { kind: "percentage"; value: number }
  | { kind: "fixed"; value: number };

function assertMinorUnits(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer number of pence.`);
  }
}

export function applyDiscount(subtotalPence: number, discount?: Discount): number {
  assertMinorUnits(subtotalPence, "Subtotal");
  if (!discount) return 0;
  if (!Number.isFinite(discount.value) || discount.value < 0) {
    throw new Error("Discount must be non-negative.");
  }
  const amount = discount.kind === "fixed"
    ? discount.value
    : Math.round(subtotalPence * Math.min(discount.value, 100) / 100);
  assertMinorUnits(amount, "Discount");
  return Math.min(subtotalPence, amount);
}

export function calculateInvoiceTotals(lines: readonly InvoiceLine[], discount?: Discount) {
  const subtotalPence = lines.reduce((total, line) => {
    assertMinorUnits(line.quantity, "Quantity");
    if (line.quantity === 0) throw new Error("Quantity must be greater than zero.");
    assertMinorUnits(line.unitAmountPence, "Unit amount");
    return total + line.quantity * line.unitAmountPence;
  }, 0);
  assertMinorUnits(subtotalPence, "Subtotal");
  const discountPence = applyDiscount(subtotalPence, discount);
  return { subtotalPence, discountPence, totalPence: subtotalPence - discountPence, currency: "GBP" as const };
}

export function calculateRefund(input: { paidPence: number; previouslyRefundedPence: number; requestedPence: number }): number {
  assertMinorUnits(input.paidPence, "Paid amount");
  assertMinorUnits(input.previouslyRefundedPence, "Previous refunds");
  assertMinorUnits(input.requestedPence, "Requested refund");
  const refundable = input.paidPence - input.previouslyRefundedPence;
  if (input.requestedPence > refundable) throw new Error("Refund exceeds the refundable balance.");
  return input.requestedPence;
}

export function reconcileCash(input: { expectedPence: number; countedPence: number }) {
  assertMinorUnits(input.expectedPence, "Expected amount");
  assertMinorUnits(input.countedPence, "Counted amount");
  const variancePence = input.countedPence - input.expectedPence;
  return { ...input, variancePence, status: variancePence === 0 ? "balanced" as const : "variance" as const };
}
