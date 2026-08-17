-- Season rollover: cloning last season's teams, and their rosters, into the next.
--
-- WHY THIS FILE EXISTS BEFORE THE CODE. The Phase 1 plan said `announcements:manage`
-- was enough to publish an announcement and it was not; Task 12 needed migration
-- 0029 to make the composer work at all. The 12b handoff makes the same shape of
-- claim about this task -- "teams carries a direct write policy, so 12b should need
-- no migration" -- and it is right, but section A proves it rather than trusting it.
-- If a future change breaks club-admin's ability to insert a team, that is a broken
-- assertion here rather than a broken screen nobody opened.
--
-- One correction while proving it: the handoff quotes teams_manage_scoped as
-- requiring organisation-scoped teams:manage in both arms. Its USING arm is actually
-- team-scoped on the team's own id (0002_people_households.sql:406). Only WITH CHECK
-- is organisation-scoped, and WITH CHECK is the arm that governs INSERT, so the
-- conclusion survives the correction.
--
-- WHAT THE ADVANCE RULE IS. `age_groups` carries minimum_age and maximum_age and
-- there is no next_age_group_id, so "last year's Under 10s become this year's Under
-- 11s" has to be derived. The rule is the strict one: for an age group with
-- minimum_age = N, the successor is the age group with minimum_age = N + 1, and if
-- there is none the team is reported and NOT created.
--
-- That is deliberately conservative, and the seed shows why it matters. Riverside
-- has "Under 7" (5-7) and "Under 11" (9-11) and nothing between them, so under the
-- strict rule neither seeded team can advance and both are reported. A looser rule
-- -- "the next age group up, whatever the gap" -- would quietly promote the Under 7s
-- four years into Under 11. Skipping and reporting lets the club create the missing
-- age group; silently promoting a seven-year-old into an eleven-year-old side is the
-- kind of wrong that only shows up on a pitch.
--
-- The consequence for this file is that the seed alone can only exercise the skip
-- branch. The fixtures below add an "Under 8" so the advancing path is asserted too.
-- Without it every assertion here would pass while testing half the function.
--
-- ROSTERS TRAVEL, AND ARE RE-CHECKED. A cloned team with no players is close to
-- useless and no club will re-add 150 children by hand, so team_memberships are
-- cloned too. Each child's age is re-checked at the TARGET season's start date
-- against the new age group's range, and anyone who no longer fits is reported
-- rather than carried. A child ageing out of a side is normal and the club has to
-- see it, not discover it in a squad selection screen in September.
--
-- ISOLATION NOTE: no savepoints. pgTAP keeps its test log in temporary tables inside
-- this transaction, so `rollback to savepoint` would discard the bookkeeping and
-- finish() would report "No tests run!". Refusals run inside probe_sqlstate, whose
-- BEGIN/EXCEPTION block is a subtransaction that always rolls back. The rollover
-- itself is run for real and its effects are asserted directly, undone by the
-- closing rollback.
--
-- Seeded identities and shape (supabase/seed.sql):
--   org ...0101 "Riverside Juniors", season ...0701 "2026/27" starting 2026-08-01
--   age groups ...0711 "Under 7" (5-7) and ...0712 "Under 11" (9-11)
--   teams ...0801 "Under 7s" (age group 0711) and ...0802 "Under 11s" (0712)
--   user ...0202 Sam Taylor -> coach of team ...0802, holds no teams:manage
--   user ...0203 Priya Shah -> membership ...0303, org-scoped club-admin

begin;

select plan(23);

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
-- Fixtures, inserted as superuser. No migration declares `force row level
-- security`, so the table owner bypasses RLS here: these are fixtures, not
-- assertions.
-- ---------------------------------------------------------------------------

-- The target season. Rollover needs somewhere to roll to and the seed has only one
-- season. Starting 2027-08-01 puts exactly one year between the two, which is what
-- makes the age re-check below meaningful rather than arbitrary.
insert into public.seasons (id, organisation_id, name, starts_on, ends_on, is_active)
values (
  '00000000-0000-4000-8000-000000000702',
  '00000000-0000-4000-8000-000000000101',
  '2027/28 season', '2027-08-01', '2028-06-30', false
)
on conflict (id) do nothing;

-- "Under 8", minimum_age 6, which is minimum_age + 1 of "Under 7". This is the only
-- reason any team in this file can advance at all. "Under 11" (minimum_age 9) still
-- has no successor at minimum_age 10, so the Under 11s remain the skip case.
insert into public.age_groups (id, organisation_id, name, minimum_age, maximum_age)
values (
  '00000000-0000-4000-8000-000000000713',
  '00000000-0000-4000-8000-000000000101',
  'Under 8', 6, 8
)
on conflict (id) do nothing;

-- A child who has aged out. Born 2017-01-01, so on 2027-08-01 they are 10, outside
-- "Under 8" (6-8). Maya Morgan (...0602, born 2019-04-08) is 8 on that date and
-- fits, so the two together prove the check discriminates rather than carrying
-- everyone or nobody.
insert into public.players (id, organisation_id, first_name, last_name, date_of_birth)
values (
  '00000000-0000-4000-8000-000000003101',
  '00000000-0000-4000-8000-000000000101',
  'Robin', 'Older', '2017-01-01'
)
on conflict (id) do nothing;

insert into public.team_memberships (id, organisation_id, team_id, member_kind, player_id)
values (
  '00000000-0000-4000-8000-000000003102',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000801',
  'player',
  '00000000-0000-4000-8000-000000003101'
)
on conflict (id) do nothing;

-- A second organisation, so the cross-tenant refusal is a real refusal. Without its
-- own season and age group the insert would fail on the composite foreign keys
-- (23503) and the assertion would pass without ever reaching the policy.
insert into public.organisations (id, name, slug, status)
values (
  '00000000-0000-4000-8000-000000000102', 'Meadow Park Juniors', 'meadow-park-juniors', 'active'
)
on conflict (id) do nothing;

insert into public.seasons (id, organisation_id, name, starts_on, ends_on, is_active)
values (
  '00000000-0000-4000-8000-000000000703',
  '00000000-0000-4000-8000-000000000102',
  '2027/28 season', '2027-08-01', '2028-06-30', false
)
on conflict (id) do nothing;

insert into public.age_groups (id, organisation_id, name, minimum_age, maximum_age)
values (
  '00000000-0000-4000-8000-000000000714',
  '00000000-0000-4000-8000-000000000102',
  'Under 8', 6, 8
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- A. The raw write surface, which is what "12b needs no migration" means
--
-- Every assertion here passes against the schema as it stands. They are the proof of
-- the handoff's claim, not a description of new behaviour.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000203', true);

select is(
  public.probe_sqlstate(array[
    $$insert into public.teams (organisation_id, season_id, age_group_id, name)
      values ('00000000-0000-4000-8000-000000000101',
              '00000000-0000-4000-8000-000000000702',
              '00000000-0000-4000-8000-000000000713', 'Under 8')$$
  ]),
  '00000',
  'a club administrator can create a team in a new season, with no RPC involved'
);

-- The same name in the season the source team already occupies. This is what makes
-- rollover a straight insert rather than a rename dance: the unique key carries
-- season_id, so "Under 7s" in 2027/28 would not collide with "Under 7s" in 2026/27,
-- but a second rollover into the same season does.
select is(
  public.probe_sqlstate(array[
    $$insert into public.teams (organisation_id, season_id, age_group_id, name)
      values ('00000000-0000-4000-8000-000000000101',
              '00000000-0000-4000-8000-000000000701',
              '00000000-0000-4000-8000-000000000711', 'Under 7s')$$
  ]),
  '23505',
  'a duplicate team name within one season is refused by the unique key'
);

select is(
  public.probe_sqlstate(array[
    $$insert into public.teams (organisation_id, season_id, age_group_id, name)
      values ('00000000-0000-4000-8000-000000000102',
              '00000000-0000-4000-8000-000000000703',
              '00000000-0000-4000-8000-000000000714', 'Under 8')$$
  ]),
  '42501',
  'a club administrator cannot create a team in another club'
);

select is(
  public.probe_sqlstate(array[
    $$insert into public.team_memberships (organisation_id, team_id, member_kind, player_id)
      values ('00000000-0000-4000-8000-000000000101',
              '00000000-0000-4000-8000-000000000802', 'player',
              '00000000-0000-4000-8000-000000003101')$$
  ]),
  '00000',
  'a club administrator can place a player in a team, so rosters can travel'
);

-- The lists the rollover form is built from. This is the 0026 defect class: a screen
-- whose dropdowns are empty for exactly the person it exists for, with nothing
-- thrown and nothing logged.
select is(
  public.probe_read('select 1 from public.seasons'),
  'visible',
  'a club administrator can read the season list, to choose source and target'
);

select is(
  public.probe_read('select 1 from public.age_groups'),
  'visible',
  'a club administrator can read the age group list, to derive the advance'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000202', true);

-- 0020 removed teams:manage from the team_staff array on purpose: only club
-- administrators create teams. If either of these flips to '00000', a coach can
-- restructure the club.
select is(
  public.probe_sqlstate(array[
    $$insert into public.teams (organisation_id, season_id, age_group_id, name)
      values ('00000000-0000-4000-8000-000000000101',
              '00000000-0000-4000-8000-000000000702',
              '00000000-0000-4000-8000-000000000713', 'Coach made this')$$
  ]),
  '42501',
  'a coach cannot create a team'
);

select is(
  public.probe_sqlstate(array[
    $$insert into public.team_memberships (organisation_id, team_id, member_kind, player_id)
      values ('00000000-0000-4000-8000-000000000101',
              '00000000-0000-4000-8000-000000000802', 'player',
              '00000000-0000-4000-8000-000000003101')$$
  ]),
  '42501',
  'a coach cannot place a player in a team'
);

-- ---------------------------------------------------------------------------
-- B. The preview, which is the whole point of not doing this silently
--
-- A rollover that just runs is a rollover nobody can check. The preview is what the
-- club-admin reads before committing, so it has to be honest about the teams that
-- cannot move and the children who no longer fit.
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000203', true);

select is(
  (select entry->>'proposedName'
   from jsonb_array_elements(
     public.preview_season_rollover(
       '00000000-0000-4000-8000-000000000101',
       '00000000-0000-4000-8000-000000000701',
       '00000000-0000-4000-8000-000000000702'
     )->'teams'
   ) entry
   where entry->>'sourceTeamId' = '00000000-0000-4000-8000-000000000801'),
  'Under 8s',
  'the Under 7s keep their name with the age band moved up, not the age group name'
);

select is(
  (select (entry->>'canAdvance')::boolean
   from jsonb_array_elements(
     public.preview_season_rollover(
       '00000000-0000-4000-8000-000000000101',
       '00000000-0000-4000-8000-000000000701',
       '00000000-0000-4000-8000-000000000702'
     )->'teams'
   ) entry
   where entry->>'sourceTeamId' = '00000000-0000-4000-8000-000000000802'),
  false,
  'the Under 11s cannot advance, because no age group starts at minimum age 10'
);

select is(
  (select entry->>'reason'
   from jsonb_array_elements(
     public.preview_season_rollover(
       '00000000-0000-4000-8000-000000000101',
       '00000000-0000-4000-8000-000000000701',
       '00000000-0000-4000-8000-000000000702'
     )->'teams'
   ) entry
   where entry->>'sourceTeamId' = '00000000-0000-4000-8000-000000000802'),
  'no-successor-age-group',
  'and the preview says why, so the club can create the missing age group'
);

select is(
  (select (entry->>'playersCarried')::int
   from jsonb_array_elements(
     public.preview_season_rollover(
       '00000000-0000-4000-8000-000000000101',
       '00000000-0000-4000-8000-000000000701',
       '00000000-0000-4000-8000-000000000702'
     )->'teams'
   ) entry
   where entry->>'sourceTeamId' = '00000000-0000-4000-8000-000000000801'),
  1,
  'the preview counts only the children who still fit the new age group'
);

select is(
  (select jsonb_array_length(entry->'playersAgedOut')
   from jsonb_array_elements(
     public.preview_season_rollover(
       '00000000-0000-4000-8000-000000000101',
       '00000000-0000-4000-8000-000000000701',
       '00000000-0000-4000-8000-000000000702'
     )->'teams'
   ) entry
   where entry->>'sourceTeamId' = '00000000-0000-4000-8000-000000000801'),
  1,
  'and names the child who has aged out rather than dropping them silently'
);

-- ---------------------------------------------------------------------------
-- C. The rollover itself
--
-- Run for real, not inside probe_sqlstate, because the assertions are about what it
-- left behind. The closing rollback undoes it.
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000202', true);

select is(
  public.probe_sqlstate(array[
    $$select public.roll_over_season(
        '00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000000701',
        '00000000-0000-4000-8000-000000000702', null)$$
  ]),
  '42501',
  'a coach cannot roll a season over'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000203', true);

select is(
  (select (public.roll_over_season(
     '00000000-0000-4000-8000-000000000101',
     '00000000-0000-4000-8000-000000000701',
     '00000000-0000-4000-8000-000000000702', null
   )->>'createdCount')::int),
  4,
  'every Under 7 side advances, each under its own name'
);

-- The naming rule itself, not just the count. Four sides out of one age group have
-- to land on four distinct names or three of them are skipped and their rosters
-- stay behind, which is the defect 0035 fixes. "Under 11s" is absent because
-- Under 11 has no successor age group to advance into.
select is(
  (select array_agg(name order by name) from public.teams
   where organisation_id = '00000000-0000-4000-8000-000000000101'
     and season_id = '00000000-0000-4000-8000-000000000702'),
  array['U8 Eagles', 'U8 Falcons', 'U8 Hawks', 'Under 8s'],
  'each side keeps its own name with the age band moved up'
);

select is(
  (select age_group_id from public.teams
   where organisation_id = '00000000-0000-4000-8000-000000000101'
     and season_id = '00000000-0000-4000-8000-000000000702'
     and name = 'Under 8s'),
  '00000000-0000-4000-8000-000000000713'::uuid,
  'the new team sits in the successor age group'
);

select is(
  (select count(*) from public.teams
   where organisation_id = '00000000-0000-4000-8000-000000000101'
     and season_id = '00000000-0000-4000-8000-000000000702'
     and name = 'Under 11s'),
  0::bigint,
  'the team that could not advance was not created'
);

select is(
  (select count(*) from public.team_memberships membership
   join public.teams team
     on team.id = membership.team_id and team.organisation_id = membership.organisation_id
   where team.season_id = '00000000-0000-4000-8000-000000000702'
     and team.name = 'Under 8s'
     and membership.member_kind = 'player'),
  1::bigint,
  'the roster travelled with the team'
);

select is(
  (select count(*) from public.team_memberships membership
   join public.teams team
     on team.id = membership.team_id and team.organisation_id = membership.organisation_id
   where team.season_id = '00000000-0000-4000-8000-000000000702'
     and membership.player_id = '00000000-0000-4000-8000-000000003101'),
  0::bigint,
  'the child who aged out did not travel with it'
);

-- The team-scoped announcement, through publish_announcement rather than a direct
-- insert, so authored_by_membership_id is set from auth.uid() and the delivery
-- fan-out happens on the trigger.
select is(
  (select count(*) from public.announcements announcement
   join public.teams team
     on team.id = announcement.team_id and team.organisation_id = announcement.organisation_id
   where team.season_id = '00000000-0000-4000-8000-000000000702'
     and announcement.status = 'published'),
  4::bigint,
  'each created team is announced to that team, not club-wide'
);

-- Idempotency. A club-admin who double-clicks must not get two seasons' worth of
-- teams or a second announcement per team. The unique key stops the duplicate team;
-- the announcement has no such protection, so the function has to skip a team whose
-- target name is already there rather than relying on the constraint to throw.
select is(
  (select (public.roll_over_season(
     '00000000-0000-4000-8000-000000000101',
     '00000000-0000-4000-8000-000000000701',
     '00000000-0000-4000-8000-000000000702', null
   )->>'createdCount')::int),
  0,
  'running the rollover a second time creates nothing'
);

select is(
  (select count(*) from public.announcements announcement
   join public.teams team
     on team.id = announcement.team_id and team.organisation_id = announcement.organisation_id
   where team.season_id = '00000000-0000-4000-8000-000000000702'
     and announcement.status = 'published'),
  4::bigint,
  'and sends no second announcement'
);

reset role;

select * from finish();
rollback;
