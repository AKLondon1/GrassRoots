# Provider integrations

| Capability | Development behaviour | Production requirement |
|---|---|---|
| Database/Auth/Storage | explicit fictional demo or Supabase | Supabase project, URL, anon key and server-only service role |
| Email | Supabase Auth link where configured; announcement delivery retries until configured | Resend API key, verified `EMAIL_FROM`, approved sender/domain and delivery monitoring |
| Push | preference/subscription-gated announcement delivery retries until configured | authenticated HTTPS adapter, browser subscription registration and delivery monitoring |
| SMS/WhatsApp | unavailable, never simulated as sent | approved account, templates, pricing and opt-out handling |
| Payments | manual preview or Stripe test mode | Stripe secret, webhook secret and Connect account review |
| Coaching AI | off | OpenAI key, explicit privacy gate, DPIA, model/cost review and human review |
| Malware scanning | private quarantine until a verdict | authenticated HTTPS scanner accepting raw bytes and returning `{ "clean": boolean, "engine": string }` |
| Maps/weather | deterministic fallback copy | provider key, terms and outage behaviour |
| Error monitoring | redacted structured stderr event plus correlatable error reference | connect deployment logs to an approved sink; no vendor SDK is claimed |

Secrets belong in deployment environment variables, never `NEXT_PUBLIC_*` unless designed for browser exposure. Timeouts, idempotency and truthful status are mandatory for every adapter. Third-party transaction/message/AI charges remain external costs.

The push adapter receives `subscribe`/`unsubscribe` operations with a standards-based browser subscription, then `deliver` operations containing `recipientMembershipId`, `title`, `body`, same-origin `url` and `idempotencyKey`; delivery must return `{ "id": "provider-reference" }`. GrassRoots also stores an AES-GCM encrypted subscription copy for lifecycle/audit purposes. The scanner receives the original MIME type and encoded filename headers plus raw file bytes, and must return a definitive clean/rejected verdict; timeouts and malformed responses leave the object quarantined for retry.
