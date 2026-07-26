# Notifications

Domain events enqueue idempotent delivery records. Preferences, guardian relationship flags, urgency, quiet hours and digest rules are resolved before channel adapters run. In-app delivery works without paid providers. Email, web push, SMS and WhatsApp are separate adapters with their own delivery status and cost.

Only allowlisted summary fields may enter a notification. Medical detail, safeguarding bodies, private coaching notes, payment credentials and family restrictions are prohibited. Urgent cancellation copy names the event and safe logistical change, never the reason if it is sensitive.

Retries use idempotency keys and bounded attempts; dead-letter failures remain visible to authorised operators. “Sent” means the configured provider accepted the message, not that a demo adapter ran. SMS and WhatsApp may incur third-party charges.
