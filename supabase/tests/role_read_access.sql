-- Enumerates, per role, which tables that role can READ.
--
-- Four defects of one family shipped before this file existed (migrations 0023 to
-- 0026): a capability was granted without checking it against the queries the
-- screens actually run. 0026 is the clearest case. Coaches held `pitches:book` and
-- `fixtures:manage` but could not SELECT `reservation_units`, `venues`,
-- `facilities` or `opposition_contacts`, so every dropdown on the friendly form was
-- empty for exactly the people the form exists for. Nothing threw. Nothing logged.
-- The screen simply rendered nothing and no test noticed.
--
-- This file is the missing test. It asserts the read surface each role depends on
-- BEFORE the screens that depend on it are written, which is the same discipline
-- weekly_loop_rls.sql applies to writes.
--
-- WHY THREE OUTCOMES, NOT TWO. On a write, RLS raises 42501 and a test can assert
-- the SQLSTATE. On a read it does no such thing:
--
--   no GRANT on the table   -> 42501, the statement fails
--   GRANT but no policy hit -> zero rows, the statement succeeds
--   GRANT and a policy hits -> rows
--
-- The middle case is the one that shipped four times. `throws_ok` cannot see it and
-- `count(*) = 0` cannot distinguish it from a missing grant, so probe_read below
-- reports 'visible', 'empty', or the SQLSTATE. A regression then reads
-- "have: empty, want: visible" and names its own cause.
--
-- ROLES COVERED. guardian (user ...0201), coach (...0202), club administrator
-- (...0203) and platform operator (...0204). `manager` is deliberately absent:
-- role_model.sql already asserts that manager and coach hold an identical
-- permission set, and both are team-scoped, so every read below is identical for a
-- manager. `owner` is likewise covered by role_model.sql's assertion that owner and
-- club-admin carry the same authority. Seeding two more identities would assert the
-- same predicates twice.
--
-- ISOLATION NOTE: no savepoints. pgTAP keeps its test log in temporary tables
-- inside this transaction, so `rollback to savepoint` would discard the
-- bookkeeping and finish() would report "No tests run!". Reads mutate nothing, and
-- the fixtures below are undone by the closing rollback.
--
-- Seeded identities and the shape of the club (from supabase/seed.sql):
--   org ...0101 "Riverside Juniors", teams ...0801 (Under 7s) and ...0802 (Under 11s)
--   user ...0201 Alex Morgan   -> membership ...0301, guardian ...0401,
--                                 org-scoped `guardian`, children ...0601 (team 0802)
--                                 and ...0602 (team 0801)
--   user ...0202 Sam Taylor    -> membership ...0302, `coach` scoped to team ...0802,
--                                 AND an org-scoped `guardian` role for child ...0603
--   user ...0203 Priya Shah    -> membership ...0303, org-scoped `club-admin`
--   user ...0204 Morgan Lee    -> membership ...0304, org-scoped `platform-operator`

begin;

select plan(35);

-- Runs a SELECT and reports which of the three outcomes occurred. The statement is
-- wrapped in a counting subquery, so it must be a bare SELECT with no trailing
-- semicolon.
--
-- Deliberately in `public`, not `pg_temp`: a temporary schema grants USAGE to its
-- owner only, so calls made under `set local role authenticated` would fail with
-- "permission denied for schema pg_temp_N" rather than reporting the policy result.
create or replace function public.probe_read(statement text)
returns text
language plpgsql
as $fn$
declare
  visible_rows bigint;
begin
  begin
    execute format('select count(*) from (%s) probe', statement) into visible_rows;
    if visible_rows > 0 then
      return 'visible';
    end if;
    return 'empty';
  exception
    when others then
      return sqlstate;
  end;
end;
$fn$;

grant execute on function public.probe_read(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures beyond the seed, inserted as superuser. No migration declares
-- `force row level security`, so the table owner bypasses RLS here: these are
-- fixtures, not assertions.
--
-- Three tables the Phase 1 screens read carry no seed rows at all, and a read
-- assertion against an empty table cannot tell "the policy refused you" from
-- "there was nothing there". Each fixture below exists to make that distinction
-- meaningful.
-- ---------------------------------------------------------------------------

-- A reschedule notice on the Under 11s match. The parent `event` section renders
-- the latest summary array from this table.
insert into public.event_change_summaries (
  id, organisation_id, event_instance_id, team_id, changed_by_membership_id,
  edit_scope, summary
)
values (
  '00000000-0000-4000-8000-000000003001',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000001202',
  '00000000-0000-4000-8000-000000000802',
  '00000000-0000-4000-8000-000000000302',
  'this',
  '["Moved to the main pitch"]'
)
on conflict (id) do nothing;

-- TWO polls, because the deadline is part of the read predicate.
--
-- can_access_poll_respondent (0003_events_polls_squads.sql:942) lets a guardian
-- read a respondent row only while `poll.status = 'open' and poll.closes_at >=
-- now()`. The seeded poll ...1301 closed on 2026-07-24 and is now in the past, so
-- asserting against it would test the calendar rather than the policy and would
-- have quietly started failing on 2026-07-25 regardless of any code change.
--
-- Note that polls_view_team applies no such deadline, which is why the poll itself
-- stays readable after it closes while its respondent rows do not. The parent polls
-- section therefore has to handle a visible-but-closed poll; it is not a state the
-- screen can assume away.
--
-- The respondent row is the attribution trap Task 11 has to navigate:
-- poll_responses.respondent_id references THIS table, not a player or a guardian,
-- and the row carries player_id XOR membership_id.
insert into public.polls (
  id, organisation_id, team_id, title, status, closes_at, created_by_membership_id
)
values (
  '00000000-0000-4000-8000-000000003006',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000802',
  'October training time', 'open', '2099-12-31T23:59:59Z',
  '00000000-0000-4000-8000-000000000302'
)
on conflict (id) do nothing;

-- Respondent on the OPEN poll.
insert into public.poll_respondents (
  id, organisation_id, poll_id, team_id, player_id
)
values (
  '00000000-0000-4000-8000-000000003002',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000003006',
  '00000000-0000-4000-8000-000000000802',
  '00000000-0000-4000-8000-000000000601'
)
on conflict (id) do nothing;

-- Respondent on the CLOSED seeded poll, for the mirror assertion.
insert into public.poll_respondents (
  id, organisation_id, poll_id, team_id, player_id
)
values (
  '00000000-0000-4000-8000-000000003007',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000001301',
  '00000000-0000-4000-8000-000000000802',
  '00000000-0000-4000-8000-000000000601'
)
on conflict (id) do nothing;

-- announcement_recipients needs NO fixture. enqueue_published_announcement_deliveries
-- (0008_release_hardening.sql:516) is an AFTER trigger that fans a published
-- announcement out over team_audience_members, so the seed's published announcement
-- already produced a delivery row for every adult attached to the Under 11s,
-- Alex Morgan included. Worth knowing for Task 12: the recipient fan-out is the
-- database's job, and a team-scoped announcement gets it for free.

-- An UNPUBLISHED squad for the third training instance, containing Jamie Morgan.
-- The seed's only squad is published, so without this the draft question cannot be
-- asked at all.
insert into public.squads (
  id, organisation_id, event_instance_id, team_id, status
)
values (
  '00000000-0000-4000-8000-000000003004',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000001203',
  '00000000-0000-4000-8000-000000000802',
  'draft'
)
on conflict (id) do nothing;

insert into public.squad_members (
  id, organisation_id, squad_id, team_id, player_id, status, position_order
)
values (
  '00000000-0000-4000-8000-000000003005',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000003004',
  '00000000-0000-4000-8000-000000000802',
  '00000000-0000-4000-8000-000000000601',
  'selected',
  1
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- A. The lists team staff need to arrange a fixture
--
-- This section is the regression guard for migration 0026. Each of these four
-- tables was readable only by a pitch, venue or opposition administrator, none of
-- which a coach is. If one of these flips back to 'empty', a dropdown somewhere on
-- the friendly form has silently gone blank.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000202', true);

select is(
  public.probe_read('select 1 from public.venues'),
  'visible',
  'a coach can read the club venue list, to say where a friendly is played'
);

select is(
  public.probe_read('select 1 from public.facilities'),
  'visible',
  'a coach can read the club facility list'
);

select is(
  public.probe_read('select 1 from public.reservation_units'),
  'visible',
  'a coach can read the bookable pitch list they hold pitches:book against'
);

select is(
  public.probe_read('select 1 from public.opposition_contacts'),
  'visible',
  'a coach can read the opposition address book, to name an opponent'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000203', true);

select is(
  public.probe_read('select 1 from public.venues'),
  'visible',
  'a club administrator can read the venue list'
);

select is(
  public.probe_read('select 1 from public.reservation_units'),
  'visible',
  'a club administrator can read the bookable pitch list'
);

select is(
  public.probe_read('select 1 from public.opposition_contacts'),
  'visible',
  'a club administrator can read the opposition address book'
);

-- The other half of 0026: widening the read for team staff must not widen it for
-- families. A parent has no business in the club's operational lists.

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000201', true);

select is(
  public.probe_read('select 1 from public.venues'),
  'empty',
  'a guardian cannot read the club venue list'
);

select is(
  public.probe_read('select 1 from public.reservation_units'),
  'empty',
  'a guardian cannot read the bookable pitch list'
);

select is(
  public.probe_read('select 1 from public.opposition_contacts'),
  'empty',
  'a guardian cannot read the opposition address book'
);

-- ---------------------------------------------------------------------------
-- B. Every table the parent journey reads
--
-- Task 11 renders eight sections from these tables. Still signed in as Alex Morgan,
-- an org-scoped guardian whose children are on both teams.
-- ---------------------------------------------------------------------------

select is(
  public.probe_read('select 1 from public.players'),
  'visible',
  'a guardian can read a player record, for the child selector'
);

select is(
  public.probe_read('select 1 from public.teams'),
  'visible',
  'a guardian can read a team record, for the team name on every card'
);

select is(
  public.probe_read('select 1 from public.event_instances'),
  'visible',
  'a guardian can read event instances, for home and schedule'
);

select is(
  public.probe_read('select 1 from public.events'),
  'visible',
  'a guardian can read the parent event, for its kind and title'
);

select is(
  public.probe_read('select 1 from public.event_change_summaries'),
  'visible',
  'a guardian can read a change summary, for what changed on the event screen'
);

select is(
  public.probe_read('select 1 from public.availability_responses'),
  'visible',
  'a guardian can read availability replies, to see what they already answered'
);

select is(
  public.probe_read('select 1 from public.polls'),
  'visible',
  'a guardian can read open polls'
);

select is(
  public.probe_read('select 1 from public.poll_options'),
  'visible',
  'a guardian can read poll options, including pitch_capacity'
);

select is(
  public.probe_read(
    'select 1 from public.poll_respondents where id = ''00000000-0000-4000-8000-000000003002'''
  ),
  'visible',
  'a guardian can read the respondent row an OPEN poll reply must be attributed to'
);

-- The mirror. Once a poll closes the respondent row goes out of reach, so a parent
-- cannot see what they answered after the deadline even though the poll itself
-- still renders. Task 11 must not assume a visible poll has a readable respondent.
select is(
  public.probe_read(
    'select 1 from public.poll_respondents where id = ''00000000-0000-4000-8000-000000003007'''
  ),
  'empty',
  'a guardian cannot read the respondent row of a CLOSED poll'
);

select is(
  public.probe_read('select 1 from public.squads'),
  'visible',
  'a guardian can read a squad'
);

select is(
  public.probe_read(
    'select 1 from public.squad_members where player_id = ''00000000-0000-4000-8000-000000000601'''
  ),
  'visible',
  'a guardian can read their own child squad place'
);

select is(
  public.probe_read('select 1 from public.announcements'),
  'visible',
  'a guardian can read a published announcement addressed to their child team'
);

select is(
  public.probe_read('select 1 from public.private_calendar_tokens'),
  'visible',
  'a guardian can read their own calendar token, for the schedule subscribe link'
);

-- ---------------------------------------------------------------------------
-- C. Where the parent journey has to stop
--
-- Read access alone does not make a screen safe. C3 is the one to read twice.
-- ---------------------------------------------------------------------------

select is(
  public.probe_read(
    'select 1 from public.players where id = ''00000000-0000-4000-8000-000000000603'''
  ),
  'empty',
  'a guardian cannot read another family child, even a team mate of their own'
);

select is(
  public.probe_read(
    'select 1 from public.availability_responses where player_id = ''00000000-0000-4000-8000-000000000603'''
  ),
  'empty',
  'a guardian cannot read another family availability reply'
);

-- squad_members_view_linked_or_manage tests squads:view and the guardian link. It
-- does NOT test the parent squad's status, so RLS hands a family a squad that has
-- not been published. The published-only filter on the parent squad section is
-- therefore load-bearing application code, not defence in depth. If this assertion
-- ever flips to 'empty', the database has taken the job over and the filter can be
-- reconsidered; until then it must stay.
select is(
  public.probe_read(
    'select 1 from public.squad_members where squad_id = ''00000000-0000-4000-8000-000000003004'''
  ),
  'visible',
  'RLS alone lets a family read a DRAFT squad, so the parent screen must filter on published'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000202', true);

select is(
  public.probe_read(
    'select 1 from public.players where id = ''00000000-0000-4000-8000-000000000602'''
  ),
  'empty',
  'a coach cannot read a player on a team they do not staff'
);

-- ---------------------------------------------------------------------------
-- D. Announcements, which Task 12 extends
--
-- announcement_recipients carries exactly one SELECT policy,
-- announcement_recipients_own (0006_comms_finance.sql:538), which matches on the
-- reader's own membership. Nothing grants the author of an announcement sight of
-- who received it. D2 and D3 record that as the current, deliberate state: if
-- Task 12 ever wants a delivery or read-receipt view, it needs a migration, and
-- these two assertions are where that decision gets made rather than discovered.
--
-- Both probe ANOTHER member's row on purpose. An unqualified count is not the same
-- question: the coach is inside the Under 11s audience, so the publish trigger gave
-- them a delivery row of their own, and `select count(*)` returns 1 whether or not
-- an author can see anybody else. That reads as access where there is none.
-- ---------------------------------------------------------------------------

select is(
  public.probe_read('select 1 from public.announcements'),
  'visible',
  'a coach can read announcements for the team they staff'
);

select is(
  public.probe_read(
    'select 1 from public.announcement_recipients where membership_id = ''00000000-0000-4000-8000-000000000301'''
  ),
  'empty',
  'a coach cannot read ANOTHER member delivery row: no policy grants an author that'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000203', true);

select is(
  public.probe_read(
    'select 1 from public.announcement_recipients where membership_id = ''00000000-0000-4000-8000-000000000301'''
  ),
  'empty',
  'a club administrator cannot read another member delivery row either'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000201', true);

select is(
  public.probe_read('select 1 from public.announcement_recipients'),
  'visible',
  'a guardian can read their own delivery row'
);

-- ---------------------------------------------------------------------------
-- E. The platform operator holds no club data
--
-- Flagged in the Phase 1 handoff as unresolved: supporting a club by seeing their
-- screens has a safeguarding dimension and has not been decided. These three
-- assertions pin the current answer down, so that whenever it is revisited the
-- change is visible in a diff rather than arriving as a surprise.
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000204', true);

select is(
  public.probe_read('select 1 from public.players'),
  'empty',
  'a platform operator cannot read any child record'
);

select is(
  public.probe_read('select 1 from public.event_instances'),
  'empty',
  'a platform operator cannot read the club schedule'
);

select is(
  public.probe_read('select 1 from public.announcements'),
  'empty',
  'a platform operator cannot read club announcements'
);

reset role;

select * from finish();
rollback;
