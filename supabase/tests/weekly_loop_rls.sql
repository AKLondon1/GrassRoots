-- Task 0 probe: assert every RLS permission and constraint the weekly loop depends on.
--
-- Every assumption the weekly-loop build makes about the database is asserted here
-- BEFORE the application code that depends on it is written. One `npm run test:db`
-- re-answers all of them at once.
--
-- Seeded identities used here (from supabase/seed.sql):
--   user ...0201 -> membership ...0301, guardian ...0401 ("Alex Morgan"),
--                   org-scoped `guardian` role, linked to players ...0601 and ...0602
--   user ...0202 -> membership ...0302, guardian ...0403 ("Sam Taylor"),
--                   `coach` role scoped to team ...0802, holds events:manage and squads:manage
--   org ...0101 "Riverside Juniors", teams ...0801 (U7) and ...0802 (U11)
--
-- The seed contains only one organisation, so the cross-tenant assertion seeds a
-- second one (...0102) below.
--
-- ISOLATION NOTE: this file deliberately uses NO savepoints. pgTAP keeps its test
-- log in temporary tables inside this same transaction, so `rollback to savepoint`
-- discards the test bookkeeping along with the data and finish() then reports
-- "No tests run!". Instead every mutating assertion runs through
-- public.probe_sqlstate(), whose plpgsql BEGIN/EXCEPTION block is a subtransaction
-- that always rolls back. Each assertion is therefore fully isolated from the next
-- while pgTAP's own state survives.

begin;

select plan(21);

-- Runs the given statements in order inside a subtransaction that ALWAYS rolls
-- back, and reports what happened as a SQLSTATE: '00000' when every statement
-- succeeded, otherwise the SQLSTATE of the first failure.
--
-- Reporting a code rather than using throws_ok means a surprising outcome reads
-- "have: 23503, want: 42501" instead of merely "it threw", which is the whole
-- point of a probe.
--
-- Deliberately in `public`, not `pg_temp`: a temporary schema grants USAGE to its
-- owner only, so calls made under `set local role authenticated` would fail with
-- "permission denied for schema pg_temp_N" rather than reporting the policy result.
-- The whole file runs inside a transaction that rolls back, so nothing persists.
create or replace function public.probe_sqlstate(statements text[])
returns text
language plpgsql
as $fn$
declare
  statement text;
begin
  begin
    foreach statement in array statements loop
      execute statement;
    end loop;
    -- Every statement succeeded. Raise a sentinel purely to roll the
    -- subtransaction back, so the writes never reach the outer transaction.
    raise exception using errcode = 'ZZ001', message = 'probe rollback sentinel';
  exception
    when sqlstate 'ZZ001' then
      return '00000';
    when others then
      return sqlstate;
  end;
end;
$fn$;

grant execute on function public.probe_sqlstate(text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures beyond the seed, inserted as superuser. No migration declares
-- `force row level security`, so the table owner bypasses RLS here: these are
-- fixtures, not assertions.
-- ---------------------------------------------------------------------------

-- Second organisation, for the cross-tenant assertion.
insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-4000-8000-000000000206', 'casey.reed@example.test', '{"display_name":"Casey Reed"}')
on conflict (id) do nothing;

insert into public.profiles (id, display_name, account_type)
values ('00000000-0000-4000-8000-000000000206', 'Casey Reed', 'adult')
on conflict (id) do nothing;

insert into public.organisations (id, name, slug, status)
values ('00000000-0000-4000-8000-000000000102', 'Meadow Park Juniors', 'meadow-park-juniors', 'active')
on conflict (id) do nothing;

insert into public.organisation_settings (organisation_id)
values ('00000000-0000-4000-8000-000000000102')
on conflict (organisation_id) do nothing;

insert into public.memberships (id, organisation_id, user_id, status, joined_at)
values (
  '00000000-0000-4000-8000-000000000306', '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000206', 'active', '2026-07-01T09:00:00Z'
)
on conflict (id) do nothing;

insert into public.seasons (id, organisation_id, name, starts_on, ends_on, is_active)
values (
  '00000000-0000-4000-8000-000000000702', '00000000-0000-4000-8000-000000000102',
  '2026/27 season', '2026-08-01', '2027-05-31', true
)
on conflict (id) do nothing;

insert into public.age_groups (id, organisation_id, name, minimum_age, maximum_age)
values (
  '00000000-0000-4000-8000-000000000713', '00000000-0000-4000-8000-000000000102',
  'Under 11', 9, 11
)
on conflict (id) do nothing;

insert into public.teams (id, organisation_id, season_id, age_group_id, name)
values (
  '00000000-0000-4000-8000-000000000803', '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000702', '00000000-0000-4000-8000-000000000713', 'Under 11s'
)
on conflict (id) do nothing;

insert into public.events (id, organisation_id, team_id, kind, title, created_by_membership_id)
values (
  '00000000-0000-4000-8000-000000001207', '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000803', 'training', 'Meadow Park training',
  '00000000-0000-4000-8000-000000000306'
)
on conflict (id) do nothing;

insert into public.event_series (id, organisation_id, event_id, team_id, starts_at, ends_at)
values (
  '00000000-0000-4000-8000-000000001217', '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000001207', '00000000-0000-4000-8000-000000000803',
  '2026-08-02T08:30:00Z', '2026-08-02T10:00:00Z'
)
on conflict (id) do nothing;

-- An Under 7s event in org A, so the collision assertions have a second team to
-- place a simultaneous kickoff against.
insert into public.events (id, organisation_id, team_id, kind, title, created_by_membership_id)
values (
  '00000000-0000-4000-8000-000000001206', '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000801', 'training', 'Under 7s training',
  '00000000-0000-4000-8000-000000000302'
)
on conflict (id) do nothing;

insert into public.event_series (id, organisation_id, event_id, team_id, starts_at, ends_at)
values (
  '00000000-0000-4000-8000-000000001216', '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000001206', '00000000-0000-4000-8000-000000000801',
  '2026-08-09T09:00:00Z', '2026-08-09T10:30:00Z'
)
on conflict (id) do nothing;

-- An always-open instance for the availability assertions. Dates are relative to
-- now() so the probe does not rot as the seed's fixed dates fall into the past.
insert into public.events (id, organisation_id, team_id, kind, title, created_by_membership_id)
values (
  '00000000-0000-4000-8000-000000001208', '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000802', 'training', 'Availability probe session',
  '00000000-0000-4000-8000-000000000302'
)
on conflict (id) do nothing;

insert into public.event_instances (
  id, organisation_id, event_id, series_id, team_id, starts_at, ends_at, response_deadline
)
values (
  '00000000-0000-4000-8000-000000001208', '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000001208', null, '00000000-0000-4000-8000-000000000802',
  now() + interval '14 days', now() + interval '14 days' + interval '90 minutes',
  now() + interval '7 days'
)
on conflict (id) do nothing;

-- Poll fixtures for assertion 9. The seed's poll closed in the past, so reopen it;
-- otherwise can_access_poll_respondent refuses for the wrong reason.
update public.polls
set status = 'open', closes_at = now() + interval '7 days'
where id = '00000000-0000-4000-8000-000000001301';

delete from public.poll_respondents
where poll_id = '00000000-0000-4000-8000-000000001301';

insert into public.poll_respondents (id, organisation_id, poll_id, team_id, player_id)
values
  -- Jamie Morgan, guardian ...0401's own child.
  ('00000000-0000-4000-8000-000000001322', '00000000-0000-4000-8000-000000000101',
   '00000000-0000-4000-8000-000000001301', '00000000-0000-4000-8000-000000000802',
   '00000000-0000-4000-8000-000000000601'),
  -- Rowan Taylor, another family's child.
  ('00000000-0000-4000-8000-000000001323', '00000000-0000-4000-8000-000000000101',
   '00000000-0000-4000-8000-000000001301', '00000000-0000-4000-8000-000000000802',
   '00000000-0000-4000-8000-000000000603');

-- ---------------------------------------------------------------------------
-- Assertion 1: a member holding events:manage can create the full event triple
-- (events, event_series, event_instances) for a team in their organisation.
-- This is the write path that does not exist anywhere in the application today.
--
-- The three probes are cumulative rather than chained, because each probe rolls
-- itself back. If the second fails while the first passes, the series insert is
-- the problem.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000202', true);

select is(
  public.probe_sqlstate(array[
    $$insert into public.events (
        id, organisation_id, team_id, kind, title, default_location_name, created_by_membership_id
      ) values (
        '00000000-0000-4000-8000-000000001205', '00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000000802', 'match', 'Under 11s v Probe Town',
        'Riverside Sports Ground', '00000000-0000-4000-8000-000000000302'
      )$$
  ]),
  '00000',
  'events:manage member can insert an event for their own team'
);

select is(
  public.probe_sqlstate(array[
    $$insert into public.events (
        id, organisation_id, team_id, kind, title, created_by_membership_id
      ) values (
        '00000000-0000-4000-8000-000000001205', '00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000000802', 'match', 'Under 11s v Probe Town',
        '00000000-0000-4000-8000-000000000302'
      )$$,
    $$insert into public.event_series (
        id, organisation_id, event_id, team_id, starts_at, ends_at, until_at
      ) values (
        '00000000-0000-4000-8000-000000001215', '00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000001205', '00000000-0000-4000-8000-000000000802',
        '2026-10-04T09:00:00Z', '2026-10-04T10:30:00Z', '2026-12-20T09:00:00Z'
      )$$
  ]),
  '00000',
  'events:manage member can insert an event series for their own team'
);

select is(
  public.probe_sqlstate(array[
    $$insert into public.events (
        id, organisation_id, team_id, kind, title, created_by_membership_id
      ) values (
        '00000000-0000-4000-8000-000000001205', '00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000000802', 'match', 'Under 11s v Probe Town',
        '00000000-0000-4000-8000-000000000302'
      )$$,
    $$insert into public.event_series (
        id, organisation_id, event_id, team_id, starts_at, ends_at, until_at
      ) values (
        '00000000-0000-4000-8000-000000001215', '00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000001205', '00000000-0000-4000-8000-000000000802',
        '2026-10-04T09:00:00Z', '2026-10-04T10:30:00Z', '2026-12-20T09:00:00Z'
      )$$,
    $$insert into public.event_instances (
        id, organisation_id, event_id, series_id, team_id, starts_at, ends_at, response_deadline
      ) values (
        '00000000-0000-4000-8000-000000001205', '00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000001205', '00000000-0000-4000-8000-000000001215',
        '00000000-0000-4000-8000-000000000802',
        '2026-10-04T09:00:00Z', '2026-10-04T10:30:00Z', '2026-10-01T18:00:00Z'
      )$$
  ]),
  '00000',
  'events:manage member can insert an event instance for their own team'
);

-- ---------------------------------------------------------------------------
-- Assertion 2: the same member cannot write an event instance into another
-- organisation. Tenant isolation on the new write path.
-- ---------------------------------------------------------------------------

select is(
  public.probe_sqlstate(array[
    $$insert into public.event_instances (
        organisation_id, event_id, series_id, team_id, starts_at, ends_at
      ) values (
        '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000001207',
        '00000000-0000-4000-8000-000000001217', '00000000-0000-4000-8000-000000000803',
        '2026-10-11T09:00:00Z', '2026-10-11T10:30:00Z'
      )$$
  ]),
  '42501',
  'events:manage in one organisation does not permit writing into another'
);

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 3: `unique nulls not distinct (organisation_id, series_id, starts_at)`.
-- Two teams in one organisation may kick off at the same instant when each has its
-- own series; two null series_id values at the same instant collide. This is why
-- the plan always creates a series, even for a one-off event.
-- Asserted as superuser: the constraint is under test here, not the policy.
-- ---------------------------------------------------------------------------

select is(
  public.probe_sqlstate(array[
    $$insert into public.event_instances (
        organisation_id, event_id, series_id, team_id, starts_at, ends_at
      ) values
        ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001206',
         '00000000-0000-4000-8000-000000001216', '00000000-0000-4000-8000-000000000801',
         '2026-09-06T09:00:00Z', '2026-09-06T10:30:00Z'),
        ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001201',
         '00000000-0000-4000-8000-000000001211', '00000000-0000-4000-8000-000000000802',
         '2026-09-06T09:00:00Z', '2026-09-06T10:30:00Z')$$
  ]),
  '00000',
  'two teams can kick off at the same instant when each instance has its own series'
);

select is(
  public.probe_sqlstate(array[
    $$insert into public.event_instances (
        organisation_id, event_id, series_id, team_id, starts_at, ends_at
      ) values
        ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001206',
         null, '00000000-0000-4000-8000-000000000801',
         '2026-09-20T09:00:00Z', '2026-09-20T10:30:00Z'),
        ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001202',
         null, '00000000-0000-4000-8000-000000000802',
         '2026-09-20T09:00:00Z', '2026-09-20T10:30:00Z')$$
  ]),
  '23505',
  'two null-series instances at the same instant collide in one organisation'
);

-- ---------------------------------------------------------------------------
-- Assertion 4: a linked guardian may insert and update their own availability
-- response, and may not respond for a player they are not linked to.
--
-- The refusal arrives as 23503, not 42501. `validate_event_child_team_scope`
-- (migration 0009) is a BEFORE INSERT trigger raising foreign_key_violation with
-- 'Guardian must be linked to the player.', and PostgreSQL runs BEFORE row
-- triggers ahead of the RLS WITH CHECK policy. Task 9's availability service must
-- therefore map 23503 on this path to "not your child" rather than surfacing a
-- generic database error. RLS would refuse it too; the trigger simply gets there
-- first.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000201', true);

select is(
  public.probe_sqlstate(array[
    $$insert into public.availability_responses (
        id, organisation_id, event_instance_id, team_id, player_id, guardian_id,
        status, idempotency_key
      ) values (
        '00000000-0000-4000-8000-000000001231', '00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000001208', '00000000-0000-4000-8000-000000000802',
        '00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000401',
        'available', 'probe-linked-guardian-insert'
      )$$
  ]),
  '00000',
  'linked guardian can insert an availability response for their own child'
);

select is(
  public.probe_sqlstate(array[
    $$insert into public.availability_responses (
        id, organisation_id, event_instance_id, team_id, player_id, guardian_id,
        status, idempotency_key
      ) values (
        '00000000-0000-4000-8000-000000001231', '00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000001208', '00000000-0000-4000-8000-000000000802',
        '00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000401',
        'available', 'probe-linked-guardian-insert'
      )$$,
    $$update public.availability_responses
      set status = 'unavailable'
      where id = '00000000-0000-4000-8000-000000001231'$$
  ]),
  '00000',
  'linked guardian can update their own availability response'
);

select is(
  public.probe_sqlstate(array[
    $$insert into public.availability_responses (
        organisation_id, event_instance_id, team_id, player_id, guardian_id,
        status, idempotency_key
      ) values (
        '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001208',
        '00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000603',
        '00000000-0000-4000-8000-000000000401', 'available', 'probe-unlinked-guardian'
      )$$
  ]),
  '23503',
  'guardian cannot respond for a player they are not linked to'
);

-- ---------------------------------------------------------------------------
-- Assertion 7: player_guardians_select_own_or_scoped shows a guardian only their
-- own links. Guardian ...0401 holds links ...0901 and ...0902; links ...0903
-- (guardian ...0402, co-guardian of the same child) and ...0904 (guardian ...0403)
-- must stay hidden. Read-only, so it runs here while ...0201 is still the caller.
-- ---------------------------------------------------------------------------

select is(
  (select count(*) from public.player_guardians),
  2::bigint,
  'guardian sees exactly their own two player_guardians links'
);

select is(
  (select count(*) from public.player_guardians
   where guardian_id <> '00000000-0000-4000-8000-000000000401'),
  0::bigint,
  'guardian sees no other guardian links, including co-guardians of the same child'
);

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 5: squads:manage permits insert and delete on squad_members but NOT
-- update. There is no UPDATE policy, so squad selection must delete and re-insert
-- rather than upsert. The second probe exercises exactly that pattern.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000202', true);

select is(
  public.probe_sqlstate(array[
    $$delete from public.squad_members
      where id = '00000000-0000-4000-8000-000000001409'$$
  ]),
  '00000',
  'squads:manage member can delete a squad member'
);

select is(
  public.probe_sqlstate(array[
    $$delete from public.squad_members
      where id = '00000000-0000-4000-8000-000000001409'$$,
    $$insert into public.squad_members (
        organisation_id, squad_id, team_id, player_id, status, position_order
      ) values (
        '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001401',
        '00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000609',
        'standby', 8
      )$$
  ]),
  '00000',
  'squad selection can delete then re-insert a squad member'
);

select is(
  public.probe_sqlstate(array[
    $$update public.squad_members
      set position_order = 11
      where id = '00000000-0000-4000-8000-000000001402'$$
  ]),
  '42501',
  'squad_members has no UPDATE policy, so selection must delete and re-insert'
);

-- ---------------------------------------------------------------------------
-- Assertion 8: event_change_summaries requires events:manage and a summary that
-- is a JSON array.
-- ---------------------------------------------------------------------------

select is(
  public.probe_sqlstate(array[
    $$insert into public.event_change_summaries (
        organisation_id, event_instance_id, team_id, changed_by_membership_id,
        edit_scope, summary
      ) values (
        '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001201',
        '00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000302',
        'this', '["Kick-off moved to 10:00"]'::jsonb
      )$$
  ]),
  '00000',
  'events:manage member can record a change summary as a JSON array'
);

select is(
  public.probe_sqlstate(array[
    $$insert into public.event_change_summaries (
        organisation_id, event_instance_id, team_id, changed_by_membership_id,
        edit_scope, summary
      ) values (
        '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001201',
        '00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000302',
        'this', '{"note":"Kick-off moved"}'::jsonb
      )$$
  ]),
  '23514',
  'a change summary that is a JSON object rather than an array is rejected'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000201', true);

select is(
  public.probe_sqlstate(array[
    $$insert into public.event_change_summaries (
        organisation_id, event_instance_id, team_id, changed_by_membership_id,
        edit_scope, summary
      ) values (
        '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001201',
        '00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000301',
        'this', '["Kick-off moved to 10:00"]'::jsonb
      )$$
  ]),
  '42501',
  'a member without events:manage cannot record a change summary'
);

-- ---------------------------------------------------------------------------
-- Assertion 9: what poll_responses actually permits. This decides whether the
-- Task 11 fix to saveProductionPollResponse (which currently trusts a
-- client-supplied respondent_id) is defence in depth or the only line of defence.
-- If the second probe returns '00000', RLS accepts any respondent in the
-- organisation and the application fix is the only thing standing between a
-- parent and another family's poll response.
-- Still acting as guardian ...0401 (user ...0201) from the block above.
-- ---------------------------------------------------------------------------

select is(
  public.probe_sqlstate(array[
    $$insert into public.poll_responses (
        organisation_id, poll_id, option_id, respondent_id, response
      ) values (
        '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001301',
        '00000000-0000-4000-8000-000000001311', '00000000-0000-4000-8000-000000001322',
        'available'
      )$$
  ]),
  '00000',
  'linked guardian can respond to a poll for their own child'
);

select is(
  public.probe_sqlstate(array[
    $$insert into public.poll_responses (
        organisation_id, poll_id, option_id, respondent_id, response
      ) values (
        '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001301',
        '00000000-0000-4000-8000-000000001311', '00000000-0000-4000-8000-000000001323',
        'available'
      )$$
  ]),
  '42501',
  'guardian cannot respond to a poll for another family child'
);

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 6: publishing a squad requires published_at and
-- published_by_membership_id together. Superuser: constraint under test.
-- ---------------------------------------------------------------------------

select is(
  public.probe_sqlstate(array[
    $$insert into public.squads (
        organisation_id, event_instance_id, team_id, status, published_at,
        published_by_membership_id
      ) values (
        '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001201',
        '00000000-0000-4000-8000-000000000802', 'published', now(), null
      )$$
  ]),
  '23514',
  'a published squad without published_by_membership_id is rejected'
);

select is(
  public.probe_sqlstate(array[
    $$insert into public.squads (
        organisation_id, event_instance_id, team_id, status, published_at,
        published_by_membership_id
      ) values (
        '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001201',
        '00000000-0000-4000-8000-000000000802', 'published', now(),
        '00000000-0000-4000-8000-000000000302'
      )$$
  ]),
  '00000',
  'a published squad carrying both publication columns is accepted'
);

select * from finish();
rollback;
