-- Team staff book pitch slots without managing pitch definitions.
--
-- Previously facility_bookings was reachable only through organisation-wide
-- pitches:manage, which also permits creating and deleting pitches, reservation
-- units and closures. Granting that to every coach to let them book a slot would
-- have handed them the club's entire facility configuration.
--
-- facility_bookings carries no team_id, so a booking's team is derived from the
-- event instance it is attached to. Requiring that link is deliberate: it stops a
-- slot being held against nothing, and it is what makes the team check possible.

create policy bookings_view_team_staff
on public.facility_bookings for select to authenticated
using (
  exists (
    select 1 from public.event_instances instance
    where instance.id = facility_bookings.event_instance_id
      and instance.organisation_id = facility_bookings.organisation_id
      and public.can_access_team(
        facility_bookings.organisation_id, instance.team_id, 'events:view'
      )
  )
);

create policy bookings_book_team_staff
on public.facility_bookings for insert to authenticated
with check (
  event_instance_id is not null
  and exists (
    select 1 from public.event_instances instance
    where instance.id = facility_bookings.event_instance_id
      and instance.organisation_id = facility_bookings.organisation_id
      and public.can_access_team(
        facility_bookings.organisation_id, instance.team_id, 'pitches:book'
      )
  )
  -- Attribution cannot be forged: the booking is recorded against the caller.
  and created_by_membership_id in (
    select membership.id from public.memberships membership
    where membership.organisation_id = facility_bookings.organisation_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
  )
);

-- Amending a slot they hold, including cancelling it. Deleting a booking outright
-- stays with pitches:manage so the facility record keeps its history.
create policy bookings_amend_team_staff
on public.facility_bookings for update to authenticated
using (
  exists (
    select 1 from public.event_instances instance
    where instance.id = facility_bookings.event_instance_id
      and instance.organisation_id = facility_bookings.organisation_id
      and public.can_access_team(
        facility_bookings.organisation_id, instance.team_id, 'pitches:book'
      )
  )
)
with check (
  event_instance_id is not null
  and exists (
    select 1 from public.event_instances instance
    where instance.id = facility_bookings.event_instance_id
      and instance.organisation_id = facility_bookings.organisation_id
      and public.can_access_team(
        facility_bookings.organisation_id, instance.team_id, 'pitches:book'
      )
  )
);
