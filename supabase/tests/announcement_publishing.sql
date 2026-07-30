-- Who may publish an announcement, and to whom.
--
-- This file exists because the capability that gates publishing is not the
-- capability whose name says it does. Migration 0020 grants `announcements:manage`
-- to manager and coach, described as "Send announcements and change notices to a
-- team". Nothing consumes it. `publish_announcement`
-- (0006_comms_finance.sql:178) checks organisation-scoped `messages:manage`, whose
-- own description is "Moderate adult group conversations"
-- (0006_comms_finance.sql:4) and which only owner and club-admin hold
-- (0006_comms_finance.sql:31, :47). A coach therefore held a permission to publish
-- that no code path honoured, and every attempt raised 42501.
--
-- That is the fifth instance of the family behind migrations 0023 to 0026: a
-- capability granted without checking it against the code that consumes it. The
-- seed had already drifted the same way — the demo announcement
-- (supabase/seed.sql:555) is team-scoped to the Under 11s and authored by the
-- coach's membership, depicting a publish the RPC refused — and so had migration
-- 0028, which grants a team-scoped author sight of delivery rows for announcements
-- they could not have created. The read side and the write side had diverged
-- before anyone looked.
--
-- WHAT 0029 SETTLES. Club-wide publishing stays with the organisation-scoped
-- roles. Team staff may publish to a team they actually staff, and to no other.
-- Section A asserts that at the RPC, which is the only route the product uses.
--
-- WHY SECTION B IS READS, NOT WRITES. `announcements` carries `grant select` and
-- nothing else (0006_comms_finance.sql:587, :595), so no authenticated user can
-- INSERT, UPDATE or DELETE the table directly whatever the policy says — the
-- missing grant refuses before RLS is consulted. The `announcements_manage`
-- policy is therefore reachable today only through the USING arm a FOR ALL policy
-- contributes to SELECT. Section B asserts that arm on the one row shape
-- `announcements_read` cannot reach: an announcement that is not yet published.
--
-- ISOLATION NOTE: no savepoints. pgTAP keeps its test log in temporary tables
-- inside this transaction, so `rollback to savepoint` would discard the
-- bookkeeping and finish() would report "No tests run!". The mutating assertions
-- run inside probe_sqlstate, whose BEGIN/EXCEPTION block is a subtransaction that
-- always rolls back, and the fixtures below are undone by the closing rollback.
--
-- Seeded identities and the shape of the club (from supabase/seed.sql):
--   org ...0101 "Riverside Juniors", teams ...0801 (Under 7s) and ...0802 (Under 11s)
--   user ...0201 Alex Morgan -> membership ...0301, org-scoped `guardian`
--   user ...0202 Sam Taylor  -> membership ...0302, `coach` scoped to team ...0802
--                               ONLY, plus an org-scoped `guardian` role
--   user ...0203 Priya Shah  -> membership ...0303, org-scoped `club-admin`

begin;

select plan(11);

-- Runs each statement in order and reports the SQLSTATE of the first failure, or
-- '00000' if all of them succeeded. The sentinel exception rolls the subtransaction
-- back either way, so an assertion that succeeds leaves no row behind.
--
-- Deliberately in `public`, not `pg_temp`: a temporary schema grants USAGE to its
-- owner only, so calls made under `set local role authenticated` would fail with
-- "permission denied for schema pg_temp_N" rather than reporting the result.
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
    raise exception using errcode = 'ZZ001', message = 'probe rollback sentinel';
  exception
    when sqlstate 'ZZ001' then return '00000';
    when others then return sqlstate;
  end;
end;
$fn$;

grant execute on function public.probe_sqlstate(text[]) to authenticated;

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
-- Two UNPUBLISHED announcements. The seed's only announcement is published, and a
-- published announcement is readable through `announcements_read`
-- (0006_comms_finance.sql:536) by anyone in its audience. That policy would answer
-- Section B on its own and the manage arm would never be exercised, so the
-- assertion would pass whether or not 0029 changed anything.
--
-- Their status is 'draft' rather than 'scheduled' because the table's check
-- constraint (0006_comms_finance.sql:68) ties 'scheduled' to a scheduled_for
-- timestamp, and the distinction is irrelevant to the policy under test. Neither
-- row triggers the delivery fan-out, which fires only on a published row
-- (0008_release_hardening.sql:521).
-- ---------------------------------------------------------------------------

-- Addressed to the Under 11s, the team the coach staffs.
insert into public.announcements (
  id, organisation_id, team_id, authored_by_membership_id, title, body, status
)
values (
  '00000000-0000-4000-8000-000000004011',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000802',
  '00000000-0000-4000-8000-000000000302',
  'Draft: kit collection',
  'Still deciding the date for kit collection.',
  'draft'
)
on conflict (id) do nothing;

-- Club-wide, authored by the club administrator. The coach must not reach this one.
insert into public.announcements (
  id, organisation_id, team_id, authored_by_membership_id, title, body, status
)
values (
  '00000000-0000-4000-8000-000000004012',
  '00000000-0000-4000-8000-000000000101',
  null,
  '00000000-0000-4000-8000-000000000303',
  'Draft: subscription rates',
  'Committee has not signed off next season rates yet.',
  'draft'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- A. publish_announcement, the only route the product uses
--
-- The RPC is SECURITY DEFINER, so its INSERT bypasses both the table grant and
-- RLS. Its own capability check is the whole of the authorisation, which is why
-- every assertion in this section is a call rather than a write.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000202', true);

select is(
  public.probe_sqlstate(array[
    $$select public.publish_announcement(
        '00000000-0000-4000-8000-000000000101',
        'Meet at 09:40', 'Sunday is on the main pitch.',
        '00000000-0000-4000-8000-000000000802')$$
  ]),
  '00000',
  'a coach can publish an announcement to the team they staff'
);

-- The containment half. Team staff hold `announcements:manage` at team scope only,
-- and a null team_id addresses every adult in the club.
select is(
  public.probe_sqlstate(array[
    $$select public.publish_announcement(
        '00000000-0000-4000-8000-000000000101',
        'Club notice', 'Everybody read this.', null)$$
  ]),
  '42501',
  'a coach cannot publish club-wide'
);

select is(
  public.probe_sqlstate(array[
    $$select public.publish_announcement(
        '00000000-0000-4000-8000-000000000101',
        'Under 7s notice', 'Not my team.',
        '00000000-0000-4000-8000-000000000801')$$
  ]),
  '42501',
  'a coach cannot publish to a team they do not staff'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000201', true);

-- Alex Morgan is an org-scoped guardian whose children sit on both teams. The
-- guardian set carries `announcements:view` and not `announcements:manage`, so
-- being in the audience must confer nothing. If this ever reads '00000', the team
-- arm has been written against audience membership rather than the capability.
select is(
  public.probe_sqlstate(array[
    $$select public.publish_announcement(
        '00000000-0000-4000-8000-000000000101',
        'From a parent', 'Should not be possible.',
        '00000000-0000-4000-8000-000000000802')$$
  ]),
  '42501',
  'a guardian cannot publish to their own child team'
);

select is(
  public.probe_sqlstate(array[
    $$select public.publish_announcement(
        '00000000-0000-4000-8000-000000000101',
        'From a parent, club-wide', 'Should not be possible.', null)$$
  ]),
  '42501',
  'a guardian cannot publish club-wide'
);

-- The club administrator keeps everything they had. 0029 widens the RPC; it must
-- not narrow it, and the org-scoped arm is what club-wide publishing depends on.

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000203', true);

select is(
  public.probe_sqlstate(array[
    $$select public.publish_announcement(
        '00000000-0000-4000-8000-000000000101',
        'Club-wide notice', 'Registration opens Monday.', null)$$
  ]),
  '00000',
  'a club administrator can still publish club-wide'
);

select is(
  public.probe_sqlstate(array[
    $$select public.publish_announcement(
        '00000000-0000-4000-8000-000000000101',
        'To the Under 11s', 'From the club office.',
        '00000000-0000-4000-8000-000000000802')$$
  ]),
  '00000',
  'a club administrator can publish to a team, holding announcements:manage club-wide'
);

select is(
  public.probe_sqlstate(array[
    $$select public.publish_announcement(
        '00000000-0000-4000-8000-000000000101',
        'To the Under 7s', 'From the club office.',
        '00000000-0000-4000-8000-000000000801')$$
  ]),
  '00000',
  'a club administrator can publish to any team, not merely one'
);

-- ---------------------------------------------------------------------------
-- B. The announcements_manage read arm
--
-- A FOR ALL policy contributes its USING clause to SELECT, so `announcements_manage`
-- is a second read arm alongside `announcements_read`. It is the only one that can
-- reach an announcement which is not yet published, because the second arm of
-- `announcements_read` requires status='published'.
--
-- Before 0029 both arms of `announcements_manage` demanded organisation scope, so
-- a coach could not see a draft addressed to their own team. Nothing in the
-- product writes a draft today — publish_announcement always inserts 'published'
-- — but the asymmetry is the same one that produced this file, and leaving it in
-- place would mean a future draft or scheduled composer is invisible to its own
-- author.
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000202', true);

select is(
  public.probe_read(
    'select 1 from public.announcements where id = ''00000000-0000-4000-8000-000000004011'''
  ),
  'visible',
  'a coach can read an unpublished announcement addressed to the team they staff'
);

select is(
  public.probe_read(
    'select 1 from public.announcements where id = ''00000000-0000-4000-8000-000000004012'''
  ),
  'empty',
  'a coach cannot read an unpublished club-wide announcement'
);

-- The family side of the same widening, and the reason the team arm is written
-- against `announcements:manage` rather than `is_team_audience`. A parent sits in
-- the Under 11s audience. Had the arm been written against audience membership —
-- the shape `announcements_read` uses, and the obvious thing to copy — this would
-- read 'visible' and every parent would see the coach's unfinished drafts.

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000201', true);

select is(
  public.probe_read(
    'select 1 from public.announcements where id = ''00000000-0000-4000-8000-000000004011'''
  ),
  'empty',
  'a guardian cannot read an unpublished announcement for their child team'
);

reset role;

select * from finish();
rollback;
