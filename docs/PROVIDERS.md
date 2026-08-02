# Provider integrations

| Capability | Development behaviour | Production requirement |
|---|---|---|
| Database/Auth/Storage | explicit fictional demo or Supabase | Supabase project, URL, anon key and server-only service role |
| Beta authentication | Google OAuth configured in Supabase Auth | Google Web client with exact **Authorized JavaScript origins** for the production Vercel `APP_ORIGIN` and `http://localhost:3000`, plus the exact Supabase **Authorized redirect URI** `https://your-project-ref.supabase.co/auth/v1/callback`; no wildcard or path; hosted `public.hook_restrict_beta_signup`; private expiring owner allowlist or a pending invitation |
| Email | Disabled for the shareable beta; no magic-link UI is presented | A verified custom sending domain, Resend API key, verified `EMAIL_FROM`, approved sender/domain and delivery monitoring |
| Push | preference/subscription-gated announcement delivery retries until configured | authenticated HTTPS adapter, browser subscription registration and delivery monitoring |
| SMS/WhatsApp | unavailable, never simulated as sent | approved account, templates, pricing and opt-out handling |
| Payments | manual preview or Stripe test mode | Stripe secret, webhook secret and Connect account review |
| Coaching AI | off | OpenAI key, explicit privacy gate, DPIA, model/cost review and human review |
| Malware scanning | private quarantine until a verdict | authenticated HTTPS scanner accepting raw bytes and returning `{ "clean": boolean, "engine": string }` |
| Maps/weather | deterministic fallback copy | provider key, terms and outage behaviour |
| Error monitoring | redacted structured stderr event plus correlatable error reference | connect deployment logs to an approved sink; no vendor SDK is claimed |

Secrets belong in deployment environment variables, never `NEXT_PUBLIC_*` unless designed for browser exposure. Google OAuth is configured in Supabase rather than through browser-visible application variables. The beta leaves `RESEND_API_KEY` and `EMAIL_FROM` unset and requires revocation of the credential previously disclosed before release. Timeouts, idempotency and truthful status are mandatory for every adapter. Third-party transaction/message/AI charges remain external costs.

For the beta, only a normalised Google email that is privately allowlisted with
an unexpired record or has a pending, unexpired GrassRoots invitation may create
a new Supabase Auth user. The hosted **Before User Created** hook,
`public.hook_restrict_beta_signup`, must be enabled in the Supabase project
after migration `0018_beta_auth_allowlist.sql` is applied. The initial owner
address is inserted only through a protected administration path with a future
expiry; it is never committed, documented as a real address or exposed to the
client. Google identity does not create a role, membership or organisation
access.

The push adapter receives `subscribe`/`unsubscribe` operations with a standards-based browser subscription, then `deliver` operations containing `recipientMembershipId`, `title`, `body`, same-origin `url` and `idempotencyKey`; delivery must return `{ "id": "provider-reference" }`. GrassRoots also stores an AES-GCM encrypted subscription copy for lifecycle/audit purposes. The scanner receives the original MIME type and encoded filename headers plus raw file bytes, and must return a definitive clean/rejected verdict; timeouts and malformed responses leave the object quarantined for retry.
