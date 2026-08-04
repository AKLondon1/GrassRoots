-- Correcting and removing a player, which 0022 never provided.
--
-- 0022 added `add_player_to_team` and stopped there, so a mistyped name or a
-- double-submitted child was permanent through the interface. A roster you can
-- only ever append to is not a roster.
--
-- SAME SHAPE AS 0022, and for the same reason. The table policies on `players`
-- and `team_memberships` check `people:manage` at ORGANISATION scope. That is
-- correct for a club administrator and far too wide for team staff: a coach
-- updating `players` directly would reach every child in the club. Both functions
-- below are SECURITY DEFINER and check `can_access_team`, so a coach reaches only
-- the teams they staff while an administrator still reaches everything.

create or replace function public.update_player(
  target_player_id uuid,
  player_first_name text,
  player_last_name text,
  player_date_of_birth date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organisation_id uuid;
  reachable boolean := false;
begin
  select player.organisation_id into target_organisation_id
  from public.players player where player.id = target_player_id;

  if target_organisation_id is null then
    raise exception 'Player not found' using errcode = 'no_data_found';
  end if;

  if player_date_of_birth > current_date then
    raise exception 'Date of birth cannot be in the future'
      using errcode = 'check_violation';
  end if;

  -- Reachable through ANY active team the player belongs to. A child in two
  -- squads must be editable by either team's staff, and checking only the first
  -- membership would make that depend on row order.
  select exists (
    select 1
    from public.team_memberships membership
    where membership.player_id = target_player_id
      and membership.member_kind = 'player'
      and membership.status = 'active'
      and public.can_access_team(
            target_organisation_id, membership.team_id, 'people:manage'
          )
  ) into reachable;

  if not reachable then
    raise exception 'You cannot edit this player' using errcode = '42501';
  end if;

  update public.players
  set first_name = btrim(player_first_name),
      last_name = btrim(player_last_name),
      date_of_birth = player_date_of_birth
  where id = target_player_id;
end;
$$;

/*
 * Take a player off a team.
 *
 * DEACTIVATES, never deletes. `team_memberships.status` is an enum of 'active'
 * and 'inactive', and every read in the weekly loop -- availability, squads,
 * expected-player counts -- filters to 'active'. Setting it is therefore
 * sufficient to remove the child from view, while a DELETE would take their
 * attendance and squad history with them and cascade into records a club may
 * need to keep. Re-adding later is an UPDATE, not a resurrection.
 */
create or replace function public.remove_player_from_team(
  target_player_id uuid,
  target_team_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organisation_id uuid;
begin
  select team.organisation_id into target_organisation_id
  from public.teams team where team.id = target_team_id;

  if target_organisation_id is null then
    raise exception 'Team not found' using errcode = 'no_data_found';
  end if;

  if not public.can_access_team(
    target_organisation_id, target_team_id, 'people:manage'
  ) then
    raise exception 'You cannot remove players from this team'
      using errcode = '42501';
  end if;

  update public.team_memberships
  set status = 'inactive'
  where player_id = target_player_id
    and team_id = target_team_id
    and member_kind = 'player'
    and status = 'active';

  -- False when there was nothing active to remove, so a stale button press is
  -- distinguishable from a permission failure, which raises above.
  return found;
end;
$$;

comment on function public.update_player(uuid, text, text, date) is
  'Correct a player''s name or date of birth. Team-scoped via can_access_team.';
comment on function public.remove_player_from_team(uuid, uuid) is
  'Deactivate a player''s team membership, preserving history. Returns false if already absent.';

revoke all on function public.update_player(uuid, text, text, date) from public;
revoke all on function public.remove_player_from_team(uuid, uuid) from public;
grant execute on function public.update_player(uuid, text, text, date) to authenticated;
grant execute on function public.remove_player_from_team(uuid, uuid) to authenticated;
