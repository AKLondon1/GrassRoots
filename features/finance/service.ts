import { createHmac, timingSafeEqual } from "node:crypto";

type ManualProvider = { kind: "manual-development" };
type StripeProvider = { kind: "stripe"; webhookSecret: string };
type FinanceProvider = ManualProvider | StripeProvider;

interface PaymentIntentInput {
  organisationId: string;
  invoiceId: string;
  amountPence: number;
}

export interface FinanceTransaction extends PaymentIntentInput {
  id: string;
  provider: "manual-development" | "stripe";
  providerReference: string;
  status: "settled";
}

export class MemoryFinanceStore {
  readonly transactions: FinanceTransaction[] = [];
  readonly webhookEventIds = new Set<string>();
  readonly manualIntents = new Map<string, PaymentIntentInput & { confirmed: boolean }>();
}

export function createSignedWebhook(payload: string, secret: string, timestamp: number): string {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

export function verifyStripeWebhookSignature(payload: string, signature: string, secret: string, nowSeconds: number) {
  const parts = signature.split(",").map((part) => part.trim().split("=", 2) as [string, string]);
  const timestamp = Number(parts.find(([key]) => key === "t")?.[1]);
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300 || signatures.length === 0) {
    throw new Error("Webhook signature timestamp is invalid.");
  }
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const valid = signatures.some((candidate) => {
    if (!/^[0-9a-f]{64}$/i.test(candidate)) return false;
    const receivedBuffer = Buffer.from(candidate, "hex");
    return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
  });
  if (!valid) {
    throw new Error("Webhook signature is invalid.");
  }
}

export class FinanceService {
  constructor(private readonly store: MemoryFinanceStore, private readonly provider: FinanceProvider) {}

  async startPayment(input: PaymentIntentInput) {
    if (this.provider.kind !== "manual-development") {
      throw new Error("Hosted Stripe checkout must be created by the server adapter.");
    }
    if (!Number.isSafeInteger(input.amountPence) || input.amountPence <= 0) throw new Error("Payment must be positive minor units.");
    const reference = `manual:${input.organisationId}:${input.invoiceId}`;
    this.store.manualIntents.set(reference, { ...input, confirmed: false });
    return {
      reference,
      provider: "manual-development" as const,
      status: "awaiting-manual-confirmation" as const,
      message: "This is a development ledger action. Your card has not been charged.",
    };
  }

  async confirmManualPayment(reference: string, actorMembershipId: string) {
    const intent = this.store.manualIntents.get(reference);
    if (!intent) throw new Error("Manual payment reference was not found.");
    if (intent.confirmed) throw new Error("Manual payment was already confirmed.");
    intent.confirmed = true;
    const transaction: FinanceTransaction = {
      id: `transaction:${reference}`,
      organisationId: intent.organisationId,
      invoiceId: intent.invoiceId,
      amountPence: intent.amountPence,
      provider: "manual-development",
      providerReference: `${reference}:${actorMembershipId}`,
      status: "settled",
    };
    this.store.transactions.push(transaction);
    return transaction;
  }

  async receiveStripeWebhook(payload: string, signature: string, nowSeconds = Math.floor(Date.now() / 1000)) {
    if (this.provider.kind !== "stripe") throw new Error("Stripe is not configured.");
    verifyStripeWebhookSignature(payload, signature, this.provider.webhookSecret, nowSeconds);
    const event = JSON.parse(payload) as {
      id: string;
      type: string;
      data?: { object?: { metadata?: { organisationId?: string; invoiceId?: string }; amount_received?: number; currency?: string } };
    };
    if (!event.id) throw new Error("Webhook event id is required.");
    if (this.store.webhookEventIds.has(event.id)) return { accepted: true, duplicate: true };
    this.store.webhookEventIds.add(event.id);
    if (event.type === "payment_intent.succeeded") {
      const object = event.data?.object;
      const organisationId = object?.metadata?.organisationId;
      const invoiceId = object?.metadata?.invoiceId;
      const amountPence = object?.amount_received;
      if (object?.currency?.toLowerCase() !== "gbp") {
        this.store.webhookEventIds.delete(event.id);
        throw new Error("Only GBP payment events can settle a GrassRoots invoice.");
      }
      if (!organisationId || !invoiceId || !Number.isSafeInteger(amountPence) || (amountPence ?? 0) <= 0) {
        this.store.webhookEventIds.delete(event.id);
        throw new Error("Webhook payment metadata is invalid.");
      }
      this.store.transactions.push({
        id: `transaction:${event.id}`,
        organisationId,
        invoiceId,
        amountPence: amountPence!,
        provider: "stripe",
        providerReference: event.id,
        status: "settled",
      });
    }
    return { accepted: true, duplicate: false };
  }
}
