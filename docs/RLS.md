# Row-level security

RLS is enabled on tenant and sensitive tables. Policies call active-membership and capability helpers and compare `organisation_id`; composite foreign keys prevent a child row from referring to a parent row in another club. Sensitive reads use dedicated RPCs that record metadata-only access results.

Direct authenticated grants are deliberately narrow. Service-role grants are limited to background jobs, private exports, signed-upload quarantine, retention and signed provider webhooks. The service role must never be exposed to the client.

Review checklist for each migration:

- every tenant row has `organisation_id` and a tenant-safe parent relationship;
- RLS is enabled before grants are useful;
- explicit table privileges match policies;
- writes validate active membership and resource scope;
- denial does not reveal whether a restricted record exists;
- ordinary audit/notification/analytics payloads cannot contain medical or safeguarding bodies;
- pgTAP covers cross-club, cross-household and role isolation.

The checked-in pgTAP files must be run on a disposable reset database. They have not run merely because TypeScript tests pass.
