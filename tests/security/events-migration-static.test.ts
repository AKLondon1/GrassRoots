import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/0003_events_polls_squads.sql"), "utf8");
const databaseTests = readFileSync(join(process.cwd(), "supabase/tests/events_polls_squads.sql"), "utf8");
const seed = readFileSync(join(process.cwd(), "supabase/seed.sql"), "utf8");

const tenantTables = [
  "events", "event_series", "event_instances", "event_exceptions", "event_change_summaries",
  "availability_responses", "event_attendance", "event_staff", "polls", "poll_options",
  "poll_respondents", "poll_responses", "squads", "squad_members", "squad_history",
  "standby_replacements", "transport_offers", "transport_requests", "private_calendar_tokens",
];

describe("events migration static safety", () => {
  it.each(tenantTables)("scopes and enables RLS for %s", (table) => {
    expect(migration).toMatch(new RegExp(`create table public\\.${table}[\\s\\S]*?organisation_id uuid not null`, "i"));
    expect(migration).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  });

  it("uses composite organisation and team references for canonical event children", () => {
    expect(migration).toMatch(/foreign key \(event_instance_id, organisation_id, team_id\)[\s\S]*references public\.event_instances\(id, organisation_id, team_id\)/i);
    expect(migration).toMatch(/foreign key \(poll_id, organisation_id, team_id\)[\s\S]*references public\.polls\(id, organisation_id, team_id\)/i);
    expect(migration).toMatch(/foreign key \(squad_id, organisation_id, team_id\)[\s\S]*references public\.squads\(id, organisation_id, team_id\)/i);
  });

  it("does not let an organisation-scoped guardian capability escape linked teams or players", () => {
    expect(migration).toMatch(/create function public\.can_access_team[\s\S]*role\.key <> 'guardian'[\s\S]*team_member\.team_id = requested_team_id/i);
    expect(migration).toMatch(/guardian_can_respond_for_player[\s\S]*membership\.user_id = auth\.uid\(\)/i);
    expect(migration).toMatch(/can_access_poll_respondent/i);
    expect(migration).toMatch(/squad_members_view_linked_or_manage[\s\S]*guardian_can_access_player/i);
  });

  it("stores only calendar token digests and resolves active tokens", () => {
    expect(migration).toMatch(/token_digest text not null unique[\s\S]*\^\[0-9a-f\]\{64\}\$/i);
    expect(migration).toMatch(/resolve_private_calendar_token[\s\S]*revoked_at is null/i);
    expect(migration).not.toMatch(/create table public\.private_calendar_tokens[\s\S]*?raw_token/i);
    expect(databaseTests).toMatch(/revoked calendar token is rejected/i);
  });

  it("tests recurrence scopes, cross-team denial and squad history", () => {
    expect(databaseTests).toMatch(/recurrence exception is scoped to one occurrence/i);
    expect(databaseTests).toMatch(/cross-team availability is denied/i);
    expect(databaseTests).toMatch(/squad publication records immutable history/i);
    expect(seed.indexOf("00000000-0000-4000-8000-000000000604")).toBeLessThan(
      seed.indexOf("insert into public.squad_members"),
    );
    expect(seed).toMatch(
      /insert into public\.standby_replacements[\s\S]*offered_at[\s\S]*responded_at/i,
    );
  });

  it("grants authenticated DML and provisions Phase 2 permissions for future roles", () => {
    expect(migration).toMatch(/grant select, insert, update, delete on public\.events to authenticated/i);
    expect(migration).toMatch(/roles_grant_phase2_permissions/i);
    expect(migration).toMatch(/new\.key in \('owner', 'club-admin'\)/i);
  });

  it("accepts standby through an atomic expiring RPC rather than guardian row updates", () => {
    expect(migration).toMatch(/create function public\.accept_standby_replacement[\s\S]*for update[\s\S]*expires_at <= now\(\)[\s\S]*insert into public\.squad_history/i);
    expect(migration).toMatch(/create function public\.accept_standby_replacement[\s\S]*guardian\.status = 'active'[\s\S]*can_access_team/i);
    expect(migration).toMatch(/grant select, insert, delete on public\.standby_replacements to authenticated/i);
    expect(migration).toMatch(/grant select, insert, delete on public\.squad_members to authenticated/i);
    expect(migration).toMatch(
      /revoke update on public\.squad_members, public\.standby_replacements from authenticated/i,
    );
    expect(migration).not.toMatch(/standby_update_linked_or_manage/i);
    expect(migration).not.toMatch(/grant select, insert, update[^;]*public\.standby_replacements/i);
    expect(migration).not.toMatch(/grant select, insert, update[^;]*public\.squad_members/i);
  });

  it("converts polls through a durable idempotent UUID transaction", () => {
    expect(migration).toMatch(/conversion_idempotency_key text[\s\S]*unique \(organisation_id, conversion_idempotency_key\)/i);
    expect(migration).toMatch(/create function public\.convert_poll_to_event_series[\s\S]*for update[\s\S]*insert into public\.event_series[\s\S]*status = 'converted'/i);
  });

  it("persists all recurrence edit scopes through one authorised transaction boundary", () => {
    expect(migration).toMatch(/create function public\.edit_recurring_event[\s\S]*requested_scope not in \('this', 'this-and-future', 'all'\)/i);
    expect(migration).toMatch(/requested_scope = 'this'[\s\S]*insert into public\.event_exceptions/i);
    expect(migration).toMatch(
      /coalesce\(requested_patch->>'status' = 'cancelled', false\)/i,
    );
    expect(migration).toMatch(/requested_scope = 'this-and-future'[\s\S]*insert into public\.event_series/i);
    expect(migration).toMatch(/update public\.events event[\s\S]*insert into public\.event_change_summaries/i);
    expect(migration).toMatch(/replacement_instance_id[\s\S]*references public\.event_instances[^;]*on update cascade/i);
    expect(migration).toMatch(/requested_scope <> 'all' and requested_patch \? 'title'/i);
    expect(databaseTests).toMatch(/this-and-future recurrence edit splits the series/i);
    expect(databaseTests).toMatch(/scoped title edits are rejected instead of silently disappearing/i);
  });

  it("enforces response windows and guardian identity on direct DML", () => {
    expect(migration).toMatch(/availability_response_is_open[\s\S]*response_deadline >= now\(\)/i);
    expect(migration).toMatch(/availability_validate_player_team[\s\S]*update of organisation_id, team_id, player_id, guardian_id/i);
    expect(migration).toMatch(
      /if tg_table_name in \('availability_responses', 'transport_requests'\) then[\s\S]*new\.guardian_id/i,
    );
    expect(migration).not.toMatch(
      /tg_table_name in \('availability_responses', 'transport_requests'\) and not exists/i,
    );
    expect(migration).toMatch(/can_access_poll_respondent[\s\S]*poll\.status = 'open' and poll\.closes_at >= now\(\)/i);
    expect(databaseTests).toMatch(/availability cannot be submitted after the deadline/i);
    expect(databaseTests).toMatch(/closed poll responses are denied/i);
  });

  it("denies calendar feeds for suspended organisations and inactive guardians", () => {
    expect(migration).toMatch(/private_calendar_events[\s\S]*organisation\.status = 'active'/i);
    expect(migration).toMatch(/private_calendar_events[\s\S]*guardian\.status = 'active'/i);
    expect(databaseTests).toMatch(/suspended organisation calendar feed is denied/i);
  });
});
