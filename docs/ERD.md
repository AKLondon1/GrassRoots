# Entity relationship overview

```mermaid
erDiagram
  ORGANISATIONS ||--o{ MEMBERSHIPS : has
  PROFILES ||--o{ MEMBERSHIPS : joins
  MEMBERSHIPS ||--o{ SCOPED_ROLE_ASSIGNMENTS : receives
  ROLES ||--o{ SCOPED_ROLE_ASSIGNMENTS : grants
  ORGANISATIONS ||--o{ TEAMS : owns
  ORGANISATIONS ||--o{ HOUSEHOLDS : owns
  HOUSEHOLDS ||--o{ GUARDIANS : contains
  PLAYERS ||--o{ PLAYER_GUARDIANS : linked
  GUARDIANS ||--o{ PLAYER_GUARDIANS : linked
  TEAMS ||--o{ TEAM_MEMBERSHIPS : registers
  PLAYERS ||--o{ TEAM_MEMBERSHIPS : joins
  EVENTS ||--o{ EVENT_INSTANCES : expands
  EVENT_INSTANCES ||--o{ AVAILABILITY_REQUESTS : requests
  EVENT_INSTANCES ||--o{ SQUADS : selects
  EVENT_INSTANCES ||--o{ FACILITY_BOOKINGS : allocates
  EVENT_INSTANCES ||--o{ TRAINING_SESSIONS : plans
  EVENT_INSTANCES ||--o{ MATCH_RECORDS : records
  HOUSEHOLDS ||--o{ MEMBER_INVOICES : owes
  CONSENT_DEFINITION_VERSIONS ||--o{ CONSENT_RESPONSES : records
  PLAYERS ||--|| PLAYER_MEDICAL_PROFILES : restricts
  ORGANISATIONS ||--o{ SAFEGUARDING_CONCERNS : restricts
  ORGANISATIONS ||--o{ PRIVATE_UPLOAD_INTENTS : quarantines
  ORGANISATIONS ||--o{ DATA_CORRECTION_REQUESTS : handles
```

The diagram is intentionally conceptual. Migrations define the complete columns, checks, RLS policies and composite tenant foreign keys. Children are player records, not authenticated profiles.
