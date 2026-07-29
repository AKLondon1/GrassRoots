-- Team-scoped people management.
--
-- players, guardians and player_guardians are all guarded by organisation-wide
-- people:manage. That is right for a club administrator and wrong for team staff,
-- who should only reach their own team's families.
--
-- Team scope cannot be enforced on a bare INSERT, because a new player belongs to
-- no team at the moment it is written. These RPCs take the team as an argument and
-- check against it, following create_match_day and edit_recurring_event. The
-- table policies are left alone, so the club administrator keeps a direct route and
-- team staff go through here.

create or replace function public.add_player_to_team(
  target_team_id uuid,
  player_first_name text,
  player_last_name text,
  player_date_of_birth date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organisation_id uuid;
  created_player_id uuid;
begin
  select team.organisation_id into target_organisation_id
  from public.teams team where team.id = target_team_id;

  if target_organisation_id is null then
    raise exception 'Team not found' using errcode = 'no_data_found';
  end if;

  if not public.can_access_team(
    target_organisation_id, target_team_id, 'people:manage'
  ) then
    raise exception 'You cannot add players to this team' using errcode = '42501';
  end if;

  if player_date_of_birth > current_date then
    raise exception 'Date of birth cannot be in the future'
      using errcode = 'check_violation';
  end if;

  insert into public.players (
    organisation_id, first_name, last_name, date_of_birth
  )
  values (
    target_organisation_id, btrim(player_first_name),
    btrim(player_last_name), player_date_of_birth
  )
  returning id into created_player_id;

  insert into public.team_memberships (
    organisation_id, team_id, member_kind, player_id, status, joined_on
  )
  values (
    target_organisation_id, target_team_id, 'player',
    created_player_id, 'active', current_date
  );

  return created_player_id;
end;
$$;

create or replace function public.add_guardian_for_player(
  target_player_id uuid,
  guardian_display_name text,
  guardian_email text,
  guardian_relationship text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organisation_id uuid;
  resolved_team_id uuid;
  resolved_household_id uuid;
  resolved_guardian_id uuid;
  normalised_email text := lower(btrim(guardian_email));
begin
  select player.organisation_id into target_organisation_id
  from public.players player where player.id = target_player_id;

  if target_organisation_id is null then
    raise exception 'Player not found' using errcode = 'no_data_found';
  end if;

  -- The player's team decides who may act. A player on no active team can only be
  -- reached by an organisation-scoped administrator, through the table policies.
  select team_member.team_id into resolved_team_id
  from public.team_memberships team_member
  where team_member.organisation_id = target_organisation_id
    and team_member.player_id = target_player_id
    and team_member.member_kind = 'player'
    and team_member.status = 'active'
    and public.can_access_team(
      target_organisation_id, team_member.team_id, 'people:manage'
    )
  limit 1;

  if resolved_team_id is null then
    raise exception 'You cannot add a guardian for this player'
      using errcode = '42501';
  end if;

  -- Reuse the household the child already belongs to, so siblings and second
  -- parents land together rather than fragmenting into duplicate households.
  select link.household_id into resolved_household_id
  from public.player_guardians link
  where link.organisation_id = target_organisation_id
    and link.player_id = target_player_id
  limit 1;

  if resolved_household_id is null then
    insert into public.households (organisation_id, name)
    values (target_organisation_id, btrim(guardian_display_name) || ' household')
    returning id into resolved_household_id;
  end if;

  select guardian.id into resolved_guardian_id
  from public.guardians guardian
  where guardian.organisation_id = target_organisation_id
    and guardian.email = normalised_email;

  if resolved_guardian_id is null then
    insert into public.guardians (
      organisation_id, display_name, email, status
    )
    values (
      target_organisation_id, btrim(guardian_display_name),
      normalised_email, 'pending'
    )
    returning id into resolved_guardian_id;
  end if;

  insert into public.player_guardians (
    organisation_id, household_id, player_id, guardian_id, relationship
  )
  values (
    target_organisation_id, resolved_household_id, target_player_id,
    resolved_guardian_id, btrim(guardian_relationship)
  )
  on conflict do nothing;

  return resolved_guardian_id;
end;
$$;

-- Moving a player between teams is deliberately organisation-scoped: a manager
-- must not be able to pull another team's player across into their own.
create or replace function public.move_player_to_team(
  target_player_id uuid,
  target_team_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organisation_id uuid;
begin
  select player.organisation_id into target_organisation_id
  from public.players player where player.id = target_player_id;

  if target_organisation_id is null then
    raise exception 'Player not found' using errcode = 'no_data_found';
  end if;

  if not exists (
    select 1 from public.teams team
    where team.id = target_team_id
      and team.organisation_id = target_organisation_id
  ) then
    raise exception 'Team is not in this organisation' using errcode = '42501';
  end if;

  if not public.has_capability(
    target_organisation_id, 'people:manage', 'organisation',
    target_organisation_id, null
  ) then
    raise exception 'Only a club administrator can move a player between teams'
      using errcode = '42501';
  end if;

  update public.team_memberships
  set status = 'inactive', left_on = current_date
  where organisation_id = target_organisation_id
    and player_id = target_player_id
    and member_kind = 'player'
    and status = 'active';

  insert into public.team_memberships (
    organisation_id, team_id, member_kind, player_id, status, joined_on
  )
  values (
    target_organisation_id, target_team_id, 'player',
    target_player_id, 'active', current_date
  );
end;
$$;

revoke all on function public.add_player_to_team(uuid, text, text, date) from public;
revoke all on function public.add_guardian_for_player(uuid, text, text, text) from public;
revoke all on function public.move_player_to_team(uuid, uuid) from public;

grant execute on function public.add_player_to_team(uuid, text, text, date) to authenticated;
grant execute on function public.add_guardian_for_player(uuid, text, text, text) to authenticated;
grant execute on function public.move_player_to_team(uuid, uuid) to authenticated;
