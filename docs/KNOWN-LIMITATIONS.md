# Known limitations

## External configuration

- Persistent multi-user operation requires Supabase and applied migrations.
- Card payment requires Stripe/Connect credentials and webhook configuration; otherwise only truthful manual previews/records are available.
- Transactional email uses Resend; web push uses the documented HTTPS adapter contract; both require provider credentials and a governance review. SMS, WhatsApp, maps, weather and error monitoring are not integrated.
- Uploaded files remain private in quarantine until the configured HTTPS malware-scanner adapter returns a clean verdict. The scheduled worker downloads private objects server-side, records the verdict through the service boundary, removes rejected objects and permits only clean-file promotion.

## Verification/environment

- pgTAP files are authored but require a local/disposable PostgreSQL/Supabase runner. A TypeScript test result does not prove RLS.
- Browser and performance results vary by device/provider and must be rerun against staging with production configuration.
- In a sandbox that rejects child-process spawning, Vitest, Next build/dev and Playwright cannot be executed; release claims must name that limitation rather than infer success.

## Product/governance

- Demo data is fictional and non-persistent.
- Production attendance requires a connection so child identifiers are not stored in a durable offline queue.
- Competition/age-group rules, retention, safeguarding processes and legal bases require club configuration and current legal/FA/County FA review.
- This codebase supplies technical readiness controls, not certification, legal advice, safeguarding approval or guaranteed regulatory compliance.
