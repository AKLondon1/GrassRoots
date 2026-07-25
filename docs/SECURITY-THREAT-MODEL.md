# Security threat model

## Assets and actors

Assets include child identity/linkage, contact data, medical and safeguarding records, event/squad data, payments, consent evidence, private files, auth/session tokens and provider secrets. Threat actors include unauthorised guardians, compromised volunteers, malicious tenants, leaked links, cross-site attackers, abusive platform operators and compromised providers.

## Principal threats and controls

- Cross-tenant IDOR: organisation-scoped composite keys, RLS, exact capability/resource checks and isolation tests.
- Guardian-to-child overreach: active guardian linkage and per-child permissions; generic denial responses.
- CSRF and injection: Next server-action origin validation, explicit same-origin checks on browser mutation routes, fetch metadata, Zod/input limits, CSP nonce and parameterised Supabase calls.
- Credential/token theft: HttpOnly Supabase cookies, no-store auth responses, digest-only one-time tokens, expiry, atomic consumption and revocation.
- Brute force/abuse: bounded application throttles plus database-backed rate-limit RPC for distributed enforcement.
- File malware/content confusion: signed private quarantine, size/MIME/magic-byte checks, checksum, external scan requirement and no public promotion before clean status.
- Sensitive log leakage: structured reason codes, body redaction and opaque `GR-…` error references.
- Support abuse: explicit resource allowlist, duration, reason, revocation and audit; medical/safeguarding bodies excluded.
- Provider compromise: minimum-data adapters, server-only keys, timeouts, signed webhooks and independent delivery state.
- Offline leakage: allowlist-only public cache and no sensitive durable queues.

Residual risks include volunteer device compromise, email account compromise, provider outages and configuration error. Production requires a penetration test, dependency scanning, secret scanning, incident exercises and regular access review.
