-- Season rollover: clone a season's teams, and their rosters, into the next one.
--
-- NO NEW AUTHORISATION. `teams`, `team_memberships` and `seasons` already carry
-- direct write policies, and `teams:manage` is deliberately absent from the
-- team_staff array (0020_role_model.sql:45) so only club administrators hold it.
-- supabase/tests/season_rollover.sql section A proves that against the live schema
-- rather than trusting it, because the Phase 1 plan made exactly this claim about
-- announcement publishing and was wrong, which cost migration 0029.
--
-- Every function below is SECURITY INVOKER on purpose. Rollover needs no privilege
-- the club administrator does not already have, so RLS stays the enforcer and a
-- coach calling roll_over_season is refused by the same policy that refuses them a
-- hand-written INSERT. The explicit capability check at the top only makes the
-- refusal happen before any partial work, with a clear SQLSTATE instead of whichever
-- statement happened to run first.
--
-- WHY AN RPC AT ALL, THEN. Atomicity. A rollover creating twelve teams, cloning
-- their rosters and announcing each one must not half-succeed, and a function body
-- is a single transaction. The alternative, a server action issuing thirty
-- statements, leaves "six teams cloned, then it failed" as a state a club has to
-- clean up by hand.

-- The advance, derived. There is no next_age_group_id, so the successor of an age
-- group is the one whose minimum_age is exactly one greater.
--
-- STRICTLY N+1, NOT "THE NEXT ONE UP". Riverside's seeded groups are "Under 7"
-- (5-7) and "Under 11" (9-11) with nothing between, so under this rule neither team
-- advances and both are reported. A looser rule would promote the Under 7s four
-- years into Under 11. A club with a gap in its ladder should be told to create the
-- missing age group, not have its seven-year-olds quietly moved up among the
-- eleven-year-olds.
create or replace function public.season_rollover_candidates(
  requested_organisation_id uuid,
  requested_source_season_id uuid,
  requested_target_season_id uuid
)
returns table (
  source_team_id uuid,
  source_name text,
  successor_age_group_id uuid,
  successor_age_group_name text,
  already_exists boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    team.id,
    team.name,
    successor.id,
    successor.name,
    successor.name is not null and exists (
      select 1
      from public.teams existing
      where existing.organisation_id = requested_organisation_id
        and existing.season_id = requested_target_season_id
        and existing.name = successor.name
    )
  from public.teams team
  join public.age_groups current_group
    on current_group.id = team.age_group_id
   and current_group.organisation_id = team.organisation_id
  left join public.age_groups successor
    on successor.organisation_id = team.organisation_id
   and successor.minimum_age = current_group.minimum_age + 1
  where team.organisation_id = requested_organisation_id
    and team.season_id = requested_source_season_id
    and team.status = 'active'
  order by team.name;
$$;

-- Which children still fit, measured at the TARGET season's start date.
--
-- Age is taken on the day the new season begins rather than today, because a
-- rollover run in June is deciding about a season starting in August and a child
-- with a July birthday would otherwise be judged a year too young.
--
-- Players only. `team_memberships` also carries coach and volunteer rows, but those
-- are roster listings and confer nothing: a coach's authority comes from
-- `scoped_role_assignments`. Cloning them would list staff against a team they had
-- not been appointed to, which reads as an appointment and is not one. Staffing the
-- new teams stays a deliberate act.
create or replace function public.season_rollover_players(
  requested_organisation_id uuid,
  requested_source_team_id uuid,
  requested_age_group_id uuid,
  requested_target_season_id uuid
)
returns table (player_id uuid, player_name text, age_at_start integer, fits boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    player.id,
    player.first_name || ' ' || player.last_name,
    age_years.value,
    age_years.value between successor.minimum_age and successor.maximum_age
  from public.team_memberships membership
  join public.players player
    on player.id = membership.player_id
   and player.organisation_id = membership.organisation_id
  join public.seasons target_season
    on target_season.id = requested_target_season_id
   and target_season.organisation_id = requested_organisation_id
  join public.age_groups successor
    on successor.id = requested_age_group_id
   and successor.organisation_id = requested_organisation_id
  cross join lateral (
    select extract(
      year from age(target_season.starts_on::timestamp, player.date_of_birth::timestamp)
    )::integer as value
  ) age_years
  where membership.organisation_id = requested_organisation_id
    and membership.team_id = requested_source_team_id
    and membership.member_kind = 'player'
    and membership.status = 'active'
    and player.status = 'active'
  order by player.last_name, player.first_name;
$$;

-- What the club administrator reads before committing to any of it.
--
-- A rollover that just runs is a rollover nobody can check. Every team appears here,
-- including the ones that cannot move and why, and every child who has aged out is
-- named rather than quietly dropped.
create or replace function public.preview_season_rollover(
  requested_organisation_id uuid,
  requested_source_season_id uuid,
  requested_target_season_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'teams',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'sourceTeamId', candidate.source_team_id,
          'sourceName', candidate.source_name,
          'canAdvance', candidate.successor_age_group_id is not null
                        and not candidate.already_exists,
          'reason', case
            when candidate.successor_age_group_id is null then 'no-successor-age-group'
            when candidate.already_exists then 'already-exists'
            else null
          end,
          'ageGroupId', candidate.successor_age_group_id,
          'proposedName', candidate.successor_age_group_name,
          'playersCarried', coalesce(roster.carried, 0),
          'playersAgedOut', coalesce(roster.aged_out, '[]'::jsonb)
        )
        order by candidate.source_name
      ),
      '[]'::jsonb
    )
  )
  from public.season_rollover_candidates(
    requested_organisation_id, requested_source_season_id, requested_target_season_id
  ) candidate
  left join lateral (
    select
      count(*) filter (where roster_row.fits) as carried,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'playerId', roster_row.player_id,
            'name', roster_row.player_name,
            'ageAtStart', roster_row.age_at_start
          )
        ) filter (where not roster_row.fits),
        '[]'::jsonb
      ) as aged_out
    from public.season_rollover_players(
      requested_organisation_id,
      candidate.source_team_id,
      candidate.successor_age_group_id,
      requested_target_season_id
    ) roster_row
  ) roster on candidate.successor_age_group_id is not null;
$$;

-- The commit.
--
-- `requested_teams` is the edited preview: [{"sourceTeamId": uuid, "name": text}].
-- Null means "everything that can advance, under its default name". The default is
-- the successor age group's NAME, never string surgery on the old one -- deriving
-- "Under 11s" from "Under 10s" by rewriting the digit produces nonsense the moment a
-- club names a side "Colts" or "Juniors A".
--
-- IDEMPOTENT BY SKIPPING, NOT BY FAILING. A club administrator who double-clicks
-- must not get two seasons' worth of teams or two announcements per team. The unique
-- key on (organisation_id, season_id, name) would stop the duplicate team by raising
-- 23505 and rolling the whole transaction back, which is safe but reports a failure
-- for what is really a no-op. Teams whose target name already exists are skipped and
-- reported instead, so a second run returns "created 0" and sends nothing.
create or replace function public.roll_over_season(
  requested_organisation_id uuid,
  requested_source_season_id uuid,
  requested_target_season_id uuid,
  requested_teams jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  candidate record;
  chosen_name text;
  new_team_id uuid;
  carried integer;
  created jsonb := '[]'::jsonb;
  skipped jsonb := '[]'::jsonb;
begin
  if not public.has_capability(
    requested_organisation_id, 'teams:manage', 'organisation', requested_organisation_id, null
  ) then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  if requested_source_season_id = requested_target_season_id then
    raise exception 'a season cannot be rolled over into itself'
      using errcode = 'check_violation';
  end if;

  for candidate in
    select * from public.season_rollover_candidates(
      requested_organisation_id, requested_source_season_id, requested_target_season_id
    )
  loop
    -- A team the caller left out of an edited preview is not a refusal and not an
    -- error. It is a club deciding that side does not come across.
    if requested_teams is not null and not exists (
      select 1 from jsonb_array_elements(requested_teams) entry
      where entry->>'sourceTeamId' = candidate.source_team_id::text
    ) then
      continue;
    end if;

    if candidate.successor_age_group_id is null then
      skipped := skipped || jsonb_build_object(
        'sourceTeamId', candidate.source_team_id,
        'sourceName', candidate.source_name,
        'reason', 'no-successor-age-group'
      );
      continue;
    end if;

    chosen_name := coalesce(
      nullif(btrim((
        select entry->>'name'
        from jsonb_array_elements(coalesce(requested_teams, '[]'::jsonb)) entry
        where entry->>'sourceTeamId' = candidate.source_team_id::text
        limit 1
      )), ''),
      candidate.successor_age_group_name
    );

    if exists (
      select 1 from public.teams existing
      where existing.organisation_id = requested_organisation_id
        and existing.season_id = requested_target_season_id
        and existing.name = chosen_name
    ) then
      skipped := skipped || jsonb_build_object(
        'sourceTeamId', candidate.source_team_id,
        'sourceName', candidate.source_name,
        'reason', 'already-exists'
      );
      continue;
    end if;

    insert into public.teams (organisation_id, season_id, age_group_id, name)
    values (
      requested_organisation_id, requested_target_season_id,
      candidate.successor_age_group_id, chosen_name
    )
    returning id into new_team_id;

    insert into public.team_memberships (
      organisation_id, team_id, member_kind, player_id, joined_on
    )
    select
      requested_organisation_id, new_team_id, 'player', roster_row.player_id,
      (select starts_on from public.seasons
       where id = requested_target_season_id
         and organisation_id = requested_organisation_id)
    from public.season_rollover_players(
      requested_organisation_id, candidate.source_team_id,
      candidate.successor_age_group_id, requested_target_season_id
    ) roster_row
    where roster_row.fits
    on conflict do nothing;

    get diagnostics carried = row_count;

    -- Through publish_announcement, never a direct insert into announcements: the
    -- RPC sets authored_by_membership_id from auth.uid() and the AFTER trigger
    -- enqueue_published_announcement_deliveries fans the recipients and their
    -- communication_deliveries rows out for free.
    perform public.publish_announcement(
      requested_organisation_id,
      'Your team for the new season',
      chosen_name || ' has been set up for the new season. '
        || 'Squads and fixtures will follow once the season starts.',
      new_team_id
    );

    created := created || jsonb_build_object(
      'sourceTeamId', candidate.source_team_id,
      'sourceName', candidate.source_name,
      'teamId', new_team_id,
      'name', chosen_name,
      'ageGroupId', candidate.successor_age_group_id,
      'playersCarried', carried
    );
  end loop;

  return jsonb_build_object(
    'createdCount', jsonb_array_length(created),
    'created', created,
    'skippedCount', jsonb_array_length(skipped),
    'skipped', skipped
  );
end;
$$;

revoke all on function public.season_rollover_candidates(uuid, uuid, uuid) from public;
revoke all on function public.season_rollover_players(uuid, uuid, uuid, uuid) from public;
revoke all on function public.preview_season_rollover(uuid, uuid, uuid) from public;
revoke all on function public.roll_over_season(uuid, uuid, uuid, jsonb) from public;

grant execute on function public.season_rollover_candidates(uuid, uuid, uuid) to authenticated;
grant execute on function public.season_rollover_players(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.preview_season_rollover(uuid, uuid, uuid) to authenticated;
grant execute on function public.roll_over_season(uuid, uuid, uuid, jsonb) to authenticated;

comment on function public.roll_over_season(uuid, uuid, uuid, jsonb) is
  'Clones a season''s teams and their player rosters into a target season, advancing each team to the age group one year above and announcing each new team to itself. Requires organisation-scoped teams:manage. Skips teams with no successor age group and teams whose target name already exists, so a repeated call creates nothing.';
