# Payments, consent and safeguarding boundaries

GrassRoots keeps club member money separate from the platform subscription ledger. All values are stored as integer pence in GBP. A manual development payment is a real ledger action, but it does not charge a card and must be independently reconciled by a treasurer.

Stripe is optional. To enable server-created Checkout and the signed webhook boundary, configure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` on the server, connect a Stripe account to the organisation and point a Connect webhook at `/api/stripe/webhook`. The route verifies the signature and timestamp, binds `event.account` to the organisation’s connected account and sends only the event ID, type, amount, organisation metadata and a payload hash to the idempotent database transition. Raw webhook bodies are not stored. A live charge remains dependent on the deployment's Stripe account and credentials.

Consent responses are tied to the exact published version and authorised player–guardian link. Withdrawal is retained as history and takes effect immediately.

Medical profiles and safeguarding concerns are stored separately from ordinary people and communication records. They are not directly selectable by authenticated clients. Emergency reads return only the minimum emergency summary and primary contact. Safeguarding reads require the welfare capability. Allowed and denied reads create metadata-only entries in `sensitive_access_log`; clinical notes, concern bodies and message bodies must never appear in ordinary audit, notification, delivery or analytics records.

Development setup:

1. Run the Supabase migrations in numeric order and then `supabase/seed.sql` in a non-production project.
2. Keep `NEXT_PUBLIC_DATA_MODE=demo` for the fictional, non-persistent experience.
3. Set `NEXT_PUBLIC_DATA_MODE=supabase`, the two public Supabase values and `SUPABASE_SERVICE_ROLE_KEY` for production-backed screens.
4. Leave Stripe values empty until the connected-account and webhook configuration is ready; the interface will not present an unconfigured provider as successful.
5. Set a long random `CRON_SECRET` and schedule `POST /api/internal/jobs` with `Authorization: Bearer <CRON_SECRET>`. The worker leases jobs atomically, retries failures, creates private exports, processes in-app deliveries, executes retention policies and honours delayed deletion state. Email and push deliveries remain failed/retryable until provider adapters are configured.
