-- Give every new guardian link its permission row.
--
-- add_guardian_for_player (0022) creates the household, the guardian and the
-- player_guardians link, but not the guardian_permissions row that hangs off it.
-- Without that row a parent added by team staff is invisible to every feature
-- that gates on it: member_invoices and member_invoice_assignments require
-- `permission.payments`, consent_responses requires `permission.consent`, and
-- household queries read `restricted_contact`. The link exists and nothing works.
--
-- The defaults on guardian_permissions are already the policy we want
-- (communication true, payments, consent, emergency_contact and
-- restricted_contact all false), so this inserts the row and names no columns
-- beyond the keys. A guardian starts able to receive messages about the child and
-- nothing more; anything wider is a deliberate later act by a club administrator.
--
-- Only the tail of the function changes. Everything above the player_guardians
-- insert is identical to 0022, because this is a `create or replace` and the whole
-- body has to be restated.

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
  resolved_link_id uuid;
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
  on conflict do nothing
  returning id into resolved_link_id;

  -- `on conflict do nothing` returns no row when the link already existed, so read
  -- it back. Re-running this call must be idempotent, not a no-op that leaves a
  -- link without its permissions.
  if resolved_link_id is null then
    select link.id into resolved_link_id
    from public.player_guardians link
    where link.organisation_id = target_organisation_id
      and link.household_id = resolved_household_id
      and link.player_id = target_player_id
      and link.guardian_id = resolved_guardian_id;
  end if;

  -- Column defaults carry the policy: communication true, everything else false.
  insert into public.guardian_permissions (organisation_id, player_guardian_id)
  values (target_organisation_id, resolved_link_id)
  on conflict (organisation_id, player_guardian_id) do nothing;

  return resolved_guardian_id;
end;
$$;

revoke all on function public.add_guardian_for_player(uuid, text, text, text) from public;
grant execute on function public.add_guardian_for_player(uuid, text, text, text) to authenticated;
