"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { environment } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const manualPaymentSchema = z.object({ organisationId: z.string().uuid(), workspace: z.string().min(1), invoiceId: z.string().uuid(), amountPence: z.coerce.number().int().positive(), reference: z.string().trim().min(4).max(120) });

export async function recordManualMemberPayment(formData: FormData) {
  const input = manualPaymentSchema.parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to record a member payment.");
  const { error } = await (client as unknown as SupabaseClient).rpc("record_manual_member_payment", {
    requested_organisation_id: input.organisationId,
    requested_invoice_id: input.invoiceId,
    requested_amount_pence: input.amountPence,
    requested_reference: input.reference,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/payments`);
}

const refundSchema = z.object({ organisationId: z.string().uuid(), workspace: z.string().min(1), transactionId: z.string().uuid(), amountPence: z.coerce.number().int().positive(), reason: z.string().trim().min(4).max(500) });

export async function requestMemberRefund(formData: FormData) {
  const input = refundSchema.parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to request a refund.");
  const { error } = await (client as unknown as SupabaseClient).rpc("request_member_refund", { requested_organisation_id: input.organisationId, requested_transaction_id: input.transactionId, requested_amount_pence: input.amountPence, requested_reason: input.reason });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/payments`);
}

const invoiceSchema = z.object({ organisationId: z.string().uuid(), workspace: z.string().min(1), invoiceNumber: z.string().trim().min(2).max(80), householdId: z.string().uuid(), playerId: z.string().uuid(), guardianId: z.string().uuid(), description: z.string().trim().min(2).max(240), amountPence: z.coerce.number().int().positive(), dueOn: z.iso.date() });

export async function createMemberInvoice(formData: FormData) {
  const input = invoiceSchema.parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to issue an invoice.");
  const { error } = await (client as unknown as SupabaseClient).rpc("create_member_invoice", { requested_organisation_id: input.organisationId, requested_invoice_number: input.invoiceNumber, requested_household_id: input.householdId, requested_player_id: input.playerId, requested_guardian_id: input.guardianId, requested_description: input.description, requested_amount_pence: input.amountPence, requested_due_on: input.dueOn });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/payments`);
}

const reconciliationSchema = z.object({ organisationId: z.string().uuid(), workspace: z.string().min(1), expectedPence: z.coerce.number().int().nonnegative(), countedPence: z.coerce.number().int().nonnegative(), note: z.string().trim().max(500).default("") });

export async function recordCashReconciliation(formData: FormData) {
  const input = reconciliationSchema.parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to reconcile cash.");
  const { error } = await (client as unknown as SupabaseClient).rpc("record_cash_reconciliation", { requested_organisation_id: input.organisationId, requested_expected_pence: input.expectedPence, requested_counted_pence: input.countedPence, requested_note: input.note });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/payments`);
}

export async function startStripeCheckout(formData: FormData) {
  const input = z.object({ organisationId: z.string().uuid(), workspace: z.string().min(1), invoiceId: z.string().uuid() }).parse(Object.fromEntries(formData));
  if (!environment.server.STRIPE_SECRET_KEY) throw new Error("Online card payments are not configured for this deployment.");
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to pay this invoice.");
  const db = client as unknown as SupabaseClient;
  const { data: invoice, error } = await db.from("member_invoices").select("id,invoice_number,total_pence,status,member_transactions(amount_pence,status)").eq("organisation_id", input.organisationId).eq("id", input.invoiceId).single();
  if (error || !invoice) throw new Error("This linked invoice is unavailable.");
  const paid = ((invoice.member_transactions ?? []) as Array<{ amount_pence: number; status: string }>).filter((transaction) => transaction.status === "settled").reduce((sum, transaction) => sum + transaction.amount_pence, 0);
  const outstanding = Number(invoice.total_pence) - paid;
  if (outstanding <= 0 || invoice.status === "void") throw new Error("This invoice has no payable balance.");
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Card payment configuration is unavailable.");
  const { data: account } = await (admin as unknown as SupabaseClient).from("stripe_connected_accounts").select("stripe_account_id,charges_enabled").eq("organisation_id", input.organisationId).is("disconnected_at", null).single();
  if (!account?.charges_enabled) throw new Error("The club has not enabled card charges.");
  const origin = environment.server.APP_ORIGIN;
  if (!origin) throw new Error("Card payments require a canonical application origin.");
  const payload = new URLSearchParams({ mode: "payment", "line_items[0][price_data][currency]": "gbp", "line_items[0][price_data][product_data][name]": `GrassRoots invoice ${invoice.invoice_number}`, "line_items[0][price_data][unit_amount]": String(outstanding), "line_items[0][quantity]": "1", "payment_intent_data[metadata][organisationId]": input.organisationId, "payment_intent_data[metadata][invoiceId]": input.invoiceId, success_url: `${origin}/app/${encodeURIComponent(input.workspace)}/payments?payment=success`, cancel_url: `${origin}/app/${encodeURIComponent(input.workspace)}/payments?payment=cancelled` });
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${environment.server.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": `checkout:${input.organisationId}:${input.invoiceId}:${outstanding}`, "Stripe-Account": String(account.stripe_account_id) }, body: payload, cache: "no-store" });
  const session = await response.json() as { url?: string; error?: { message?: string } };
  if (!response.ok || !session.url) throw new Error(session.error?.message ?? "Stripe Checkout could not be created.");
  redirect(session.url);
}
