-- Rolling a team up keeps the team and moves its age band.
--
-- 0030 named every advancing team after its successor age group. A club with one
-- team per age group never noticed. A club with four Under 7 sides did: all four
-- proposed the name "Under 8", the first in alphabetical order took it, and the
-- other three were skipped as `already-exists`. That reason reads like harmless
-- de-duplication. What actually happened is that three squads did not come across
-- and their rosters stayed behind in last season.
--
-- The rule is the one a club would state itself: "U7 Hawks" becomes "U8 Hawks",
-- "Under 7s" becomes "Under 8s". The age band written into the name moves up by
-- one; nothing else about the name is touched.
--
-- 0030's header rejected rewriting the digit, on the grounds that it "produces
-- nonsense the moment a club names a side 'Colts' or 'Juniors A'". That objection
-- is right, and is why a name stating no age band is carried across unchanged
-- rather than having one invented for it. Those are the only names that can still
-- collide, and they are still skipped and reported, so a double-click is still a
-- no-op and 0030's idempotency holds.

create or replace function public.season_rollover_team_name(
  source_name text,
  source_age_group_name text,
  successor_age_group_name text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  source_age text := substring(source_age_group_name from '[0-9]+');
  successor_age text := substring(successor_age_group_name from '[0-9]+');
begin
  -- An age group named without a number ("Juniors") offers nothing to move.
  if source_age is null or successor_age is null then
    return source_name;
  end if;

  -- \m anchors to the start of a word, so "U7" and "Under 7" match and the "u7"
  -- inside "Deu7" does not. (?![0-9]) stops the 1 of "U10" being taken for "U1".
  -- A name with no age band in it comes back unchanged, which is the "Colts" case.
  return regexp_replace(
    source_name,
    '(?i)\m(u(?:nder)?\s*)' || source_age || '(?![0-9])',
    '\1' || successor_age,
    'g'
  );
end;
$$;

comment on function public.season_rollover_team_name(text, text, text) is
  'Moves the age band written into a team name up by one, so "U7 Hawks" becomes "U8 Hawks" and "Under 7s" becomes "Under 8s". A name that states no age band is returned unchanged.';

-- `proposed_name` replaces the callers' habit of reading the successor age group's
-- name as if it were the new team's name. Both consumers now read one value, and
-- `already_exists` is tested against that same value rather than against a name
-- nothing will be created under.
drop function if exists public.season_rollover_candidates(uuid, uuid, uuid);

create function public.season_rollover_candidates(
  requested_organisation_id uuid,
  requested_source_season_id uuid,
  requested_target_season_id uuid
)
returns table (
  source_team_id uuid,
  source_name text,
  successor_age_group_id uuid,
  successor_age_group_name text,
  proposed_name text,
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
    proposed.name,
    proposed.name is not null and exists (
      select 1
      from public.teams existing
      where existing.organisation_id = requested_organisation_id
        and existing.season_id = requested_target_season_id
        and existing.name = proposed.name
    )
  from public.teams team
  join public.age_groups current_group
    on current_group.id = team.age_group_id
   and current_group.organisation_id = team.organisation_id
  left join public.age_groups successor
    on successor.organisation_id = team.organisation_id
   and successor.minimum_age = current_group.minimum_age + 1
  cross join lateral (
    select case
      when successor.id is null then null
      else public.season_rollover_team_name(team.name, current_group.name, successor.name)
    end as name
  ) proposed
  where team.organisation_id = requested_organisation_id
    and team.season_id = requested_source_season_id
    and team.status = 'active'
  order by team.name;
$$;

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
          'proposedName', candidate.proposed_name,
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

    -- A name the club typed still wins. The default is now the team's own name with
    -- its age band moved up, not the age group's name, so four sides advancing out
    -- of one age group land on four distinct names instead of fighting over one.
    chosen_name := coalesce(
      nullif(btrim((
        select entry->>'name'
        from jsonb_array_elements(coalesce(requested_teams, '[]'::jsonb)) entry
        where entry->>'sourceTeamId' = candidate.source_team_id::text
        limit 1
      )), ''),
      candidate.proposed_name
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

revoke all on function public.season_rollover_team_name(text, text, text) from public;
revoke all on function public.season_rollover_candidates(uuid, uuid, uuid) from public;
revoke all on function public.preview_season_rollover(uuid, uuid, uuid) from public;
revoke all on function public.roll_over_season(uuid, uuid, uuid, jsonb) from public;

grant execute on function public.season_rollover_team_name(text, text, text) to authenticated;
grant execute on function public.season_rollover_candidates(uuid, uuid, uuid) to authenticated;
grant execute on function public.preview_season_rollover(uuid, uuid, uuid) to authenticated;
grant execute on function public.roll_over_season(uuid, uuid, uuid, jsonb) to authenticated;

comment on function public.roll_over_season(uuid, uuid, uuid, jsonb) is
  'Clones a season''s teams and their player rosters into a target season, advancing each team to the age group one year above and moving the age band written into its name up with it, then announcing each new team to itself. Requires organisation-scoped teams:manage. Skips teams with no successor age group and teams whose target name already exists, so a repeated call creates nothing.';
