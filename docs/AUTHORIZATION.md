# Authorisation

Authentication proves the adult account; authorisation resolves an active membership, scoped role assignments and capabilities for one organisation. There is no global club role. A person may be a coach in one club and a parent in another.

Capabilities are scoped to organisation, team or a named resource. Navigation capability unions are hints only: every mutation must compare its exact target with a matching grant or use an RLS/RPC check. Suspended, invited and departed memberships fail active-membership resolution. Children never authenticate.

Default roles include platform operator, club administrator, facilities administrator, fixture secretary, team manager, coach, treasurer, welfare officer, guardian and tightly limited opposition contact. Facilities roles do not gain medical/finance access; treasurers do not gain coaching-note access; coaches do not gain safeguarding concern bodies.

Platform support access is club-approved, reason-bound, resource-bound, time-limited, revocable and audited. Medical and safeguarding resources are excluded from ordinary support sessions. Session and magic-response token revocation is digest-only and expiry-aware.
