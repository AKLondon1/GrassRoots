-- Make `pitches:book` actually work, for team staff booking their own fixture.
--
-- Migration 0021 introduced `pitches:book` and two RLS policies permitting team
-- staff to insert and amend facility_bookings. Those policies can never fire.
-- Migration 0004 revokes everything on public.facility_bookings from
-- `authenticated` and grants back SELECT only (0004_facilities.sql:900-906), and
-- an RLS policy filters rows a role is already privileged to touch rather than
-- conferring the privilege. So every write reaches the table through a
-- SECURITY DEFINER function, and `pitches:book` has so far granted nothing.
--
-- The fix is a team-scoped sibling of allocate_facility_booking rather than a
-- table grant. Granting INSERT to `authenticated` would route bookings around
-- reservation_units_conflict, and the GiST exclusion constraint alone is keyed
-- on reservation_unit_id, so it cannot see that "Main pitch, half A" overlaps a
-- booking of "Main pitch". Only the function knows the hierarchy, the exclusion
-- pairs, the blocks and the closures.
--
-- Differences from allocate_facility_booking:
--   * authorises with can_access_team(..., 'pitches:book') against the team read
--     from the event instance, not organisation-wide 'pitches:manage';
--   * requires the event instance, because that link is what makes the team
--     check possible. A slot cannot be held against nothing.
-- Everything else, including the advisory lock and the three conflict families,
-- is deliberately identical.

-- The dead policies from 0021 go, rather than sitting as a trap. Left in place,
-- a later migration granting INSERT on facility_bookings for some unrelated
-- reason would silently activate a direct write path that skips every check
-- above. The SELECT policy stays: it is live and it is what lets team staff see
-- the bookings for their own fixtures.
drop policy if exists bookings_book_team_staff on public.facility_bookings;
drop policy if exists bookings_amend_team_staff on public.facility_bookings;

create function public.book_pitch_for_event(
  requested_organisation_id uuid,
  requested_unit_id uuid,
  requested_event_instance_id uuid,
  requested_buffer_before integer default 0,
  requested_buffer_after integer default 0
) returns public.facility_bookings
language plpgsql security definer set search_path = '' as $$
declare
  actor_membership_id uuid;
  linked_instance record;
  created_booking public.facility_bookings;
  occupied tstzrange;
begin
  if requested_event_instance_id is null then
    raise exception 'an event instance is required' using errcode = '22004';
  end if;

  if requested_buffer_before not between 0 and 240
     or requested_buffer_after not between 0 and 240 then
    raise exception 'buffers must be between 0 and 240 minutes' using errcode = '22003';
  end if;

  -- Serialise booking attempts for this organisation. Without it two coaches
  -- booking the same slot in the same instant both pass the conflict check.
  perform pg_advisory_xact_lock(hashtextextended(requested_organisation_id::text, 0));

  select instance.starts_at, instance.ends_at, instance.team_id, event.title
    into linked_instance
  from public.event_instances instance
  join public.events event
    on event.id = instance.event_id
   and event.organisation_id = instance.organisation_id
  where instance.id = requested_event_instance_id
    and instance.organisation_id = requested_organisation_id
    and instance.status = 'scheduled'
  for update of instance;
  if not found then
    raise exception 'scheduled event instance not found' using errcode = '42704';
  end if;

  -- The team comes from the instance, never from the caller, so a coach cannot
  -- book against a team they do not staff.
  if not public.can_access_team(
    requested_organisation_id, linked_instance.team_id, 'pitches:book'
  ) then
    raise exception 'pitch booking denied' using errcode = '42501';
  end if;

  select membership.id into actor_membership_id
  from public.memberships membership
  where membership.organisation_id = requested_organisation_id
    and membership.user_id = auth.uid()
    and membership.status = 'active';
  if actor_membership_id is null then
    raise exception 'active membership required' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.facility_bookings booking
    where booking.organisation_id = requested_organisation_id
      and booking.event_instance_id = requested_event_instance_id
      and booking.status <> 'cancelled'
  ) then
    raise exception 'event instance is already allocated' using errcode = '23505';
  end if;

  if not exists (
    select 1 from public.reservation_units unit
    where unit.id = requested_unit_id
      and unit.organisation_id = requested_organisation_id
      and unit.active
  ) then
    raise exception 'reservation unit is not active' using errcode = '42704';
  end if;

  occupied := tstzrange(
    linked_instance.starts_at - make_interval(mins => requested_buffer_before),
    linked_instance.ends_at + make_interval(mins => requested_buffer_after),
    '[)'
  );

  -- Three conflict families, all of them aware of the unit hierarchy and the
  -- declared exclusion pairs through reservation_units_conflict.
  if exists (
    select 1 from public.facility_bookings booking
    where booking.organisation_id = requested_organisation_id
      and booking.status <> 'cancelled'
      and public.reservation_units_conflict(
        requested_organisation_id, booking.reservation_unit_id, requested_unit_id
      )
      and booking.occupied_range && occupied
  ) or exists (
    select 1 from public.facility_blocks block
    where block.organisation_id = requested_organisation_id
      and public.reservation_units_conflict(
        requested_organisation_id, block.reservation_unit_id, requested_unit_id
      )
      and tstzrange(block.starts_at, block.ends_at, '[)') && occupied
  ) or exists (
    select 1 from public.facility_closures closure
    where closure.organisation_id = requested_organisation_id
      and public.reservation_units_conflict(
        requested_organisation_id, closure.reservation_unit_id, requested_unit_id
      )
      and tstzrange(closure.starts_at, closure.ends_at, '[)') && occupied
  ) then
    raise exception 'facility booking conflict' using errcode = '23P01';
  end if;

  -- occupied_range is not written here: facility_bookings_set_occupied_range
  -- derives it from the times and buffers on insert.
  insert into public.facility_bookings (
    organisation_id, reservation_unit_id, event_instance_id, title,
    starts_at, ends_at, buffer_before_minutes, buffer_after_minutes,
    created_by_membership_id
  ) values (
    requested_organisation_id, requested_unit_id, requested_event_instance_id,
    linked_instance.title, linked_instance.starts_at, linked_instance.ends_at,
    requested_buffer_before, requested_buffer_after, actor_membership_id
  )
  returning * into created_booking;

  insert into public.audit_log (
    organisation_id, actor_membership_id, action, resource_type, resource_id
  ) values (
    requested_organisation_id, actor_membership_id,
    'facility.booking.allocated', 'facility_booking', created_booking.id
  );

  return created_booking;
end;
$$;

-- In line with 0017_service_function_privilege_hardening: no implicit PUBLIC
-- execute on a SECURITY DEFINER function.
revoke all on function public.book_pitch_for_event(uuid, uuid, uuid, integer, integer) from public;
grant execute on function public.book_pitch_for_event(uuid, uuid, uuid, integer, integer) to authenticated;
