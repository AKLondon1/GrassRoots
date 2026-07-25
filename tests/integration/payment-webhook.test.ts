import { describe, expect, it } from "vitest";

import { createSignedWebhook, FinanceService, MemoryFinanceStore, verifyStripeWebhookSignature } from "@/features/finance/service";

describe("payment and webhook flow", () => {
  it("creates a truthful manual payment and reconciles it once", async () => {
    const service = new FinanceService(new MemoryFinanceStore(), { kind: "manual-development" });
    const intent = await service.startPayment({ organisationId: "org-1", invoiceId: "invoice-1", amountPence: 4_500 });
    expect(intent).toMatchObject({ provider: "manual-development", status: "awaiting-manual-confirmation" });
    expect(intent.message).toMatch(/not been charged/i);
    await service.confirmManualPayment(intent.reference, "treasurer-1");
    await expect(service.confirmManualPayment(intent.reference, "treasurer-1")).rejects.toThrow(/already confirmed/i);
  });

  it("verifies signatures and processes each Stripe event id once", async () => {
    const secret = "whsec_fixture_only";
    const store = new MemoryFinanceStore();
    const service = new FinanceService(store, { kind: "stripe", webhookSecret: secret });
    const payload = JSON.stringify({ id: "evt_1", type: "payment_intent.succeeded", data: { object: { metadata: { organisationId: "org-1", invoiceId: "invoice-1" }, amount_received: 4_500, currency: "gbp" } } });
    const signature = createSignedWebhook(payload, secret, 1_784_636_400);
    const first = await service.receiveStripeWebhook(payload, signature, 1_784_636_400);
    const second = await service.receiveStripeWebhook(payload, signature, 1_784_636_400);
    expect(first).toEqual({ accepted: true, duplicate: false });
    expect(second).toEqual({ accepted: true, duplicate: true });
    expect(store.transactions).toHaveLength(1);
  });

  it("rejects a signed non-GBP payment before settlement", async () => {
    const secret = "whsec_fixture_only";
    const service = new FinanceService(new MemoryFinanceStore(), { kind: "stripe", webhookSecret: secret });
    const payload = JSON.stringify({ id: "evt_eur", type: "payment_intent.succeeded", data: { object: { metadata: { organisationId: "org-1", invoiceId: "invoice-1" }, amount_received: 4_500, currency: "eur" } } });
    await expect(service.receiveStripeWebhook(payload, createSignedWebhook(payload, secret, 1_784_636_400), 1_784_636_400)).rejects.toThrow(/GBP/i);
  });

  it("accepts any valid v1 signature during Stripe secret rotation", () => {
    const payload = "{\"id\":\"evt_rotation\"}";
    const signed = createSignedWebhook(payload, "whsec_fixture_only", 1_784_636_400);
    const header = `${signed.split(",")[0]},v1=${"0".repeat(64)},${signed.split(",")[1]}`;
    expect(() => verifyStripeWebhookSignature(payload, header, "whsec_fixture_only", 1_784_636_400)).not.toThrow();
  });
});
