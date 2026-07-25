import "server-only";

import { environment } from "@/lib/env";

export interface NotificationMessage {
  channel: "email" | "push";
  recipientEmail?: string;
  recipientMembershipId: string;
  subject: string;
  body: string;
  idempotencyKey: string;
}

export async function deliverNotification(message: NotificationMessage): Promise<{ provider: string; reference: string }> {
  if (message.channel === "email") {
    if (!environment.server.RESEND_API_KEY || !environment.server.EMAIL_FROM || !message.recipientEmail) throw new Error("email-provider-unconfigured");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${environment.server.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": message.idempotencyKey },
      body: JSON.stringify({ from: environment.server.EMAIL_FROM, to: [message.recipientEmail], subject: message.subject, text: message.body }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`email-provider-${response.status}`);
    const result = await response.json() as { id?: string };
    if (!result.id) throw new Error("email-provider-invalid-response");
    return { provider: "resend", reference: result.id };
  }

  if (!environment.server.PUSH_PROVIDER_URL || !environment.server.PUSH_PROVIDER_TOKEN) throw new Error("push-provider-unconfigured");
  const response = await fetch(environment.server.PUSH_PROVIDER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${environment.server.PUSH_PROVIDER_TOKEN}`, "Content-Type": "application/json", "Idempotency-Key": message.idempotencyKey },
    body: JSON.stringify({ operation: "deliver", recipientMembershipId: message.recipientMembershipId, title: message.subject, body: message.body, url: "/app", idempotencyKey: message.idempotencyKey }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`push-provider-${response.status}`);
  const result = await response.json() as { id?: string };
  if (!result.id) throw new Error("push-provider-invalid-response");
  return { provider: "push-adapter", reference: result.id };
}
