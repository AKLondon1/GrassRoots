# Payments

Member invoices, allocations, payments, refunds, receipts and reconciliation remain organisation-scoped and distinct from future platform subscription billing. Money is stored as integer pence and formatted in GBP. Stripe Connect is the intended member-payment boundary; every webhook requires a valid signature, connected-account/organisation match and idempotent event receipt.

Without Stripe credentials, the UI offers honest manual/offline recording only and never claims a card was charged. Test mode must be clearly labelled. Gross, provider fee, net and refund values are retained separately for reconciliation.

Do not store card details. Stripe remains an independent processor and its fees are not represented as free. Refund and financial-retention policy requires accountant and legal review before live use.
