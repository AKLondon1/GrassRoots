# Backup and restore

Enable Supabase managed backups/PITR appropriate to the club’s risk, and record retention/region in the processor register. Storage objects require a separate inventory and restore procedure; database backups alone do not restore private files.

## Restore exercise

1. Declare an incident and freeze destructive jobs.
2. Select a timestamp before corruption and restore into an isolated non-production project.
3. Apply no new migrations until schema version and migration checksums are verified.
4. Validate organisation counts, tenant isolation, event/finance totals, private-object checksums and auth/profile linkage.
5. Run pgTAP and critical browser journeys using synthetic accounts.
6. Obtain incident-owner approval, rotate affected secrets, then promote via the provider’s documented recovery process.
7. Record RPO/RTO achieved, missing objects and follow-up actions.

Perform at least quarterly restore drills. Never use live child or safeguarding data in an ad-hoc local restore. Backup access must be audited and restricted.
