-- Let team staff read the lists they need to arrange a fixture.
--
-- Migrations 0020 and 0021 gave managers and coaches `fixtures:manage` and
-- `pitches:book`, and 0023 made the booking itself work. None of them granted the
-- matching READ access, so a coach can now book a pitch but cannot see the pitch
-- list to choose one. Every dropdown on the friendly form is empty for exactly
-- the people the form exists for:
--
--   reservation_units    reservation_units_view wants pitches:manage or pitches:inspect
--   venues, facilities   venues_view / facilities_view want venues:manage
--   opposition_contacts  opposition_contacts_scoped wants opposition:manage
--
-- A coach holds none of those. This migration is read-only: booking still goes
-- through book_pitch_for_event, editing pitches still needs pitches:manage, and
-- editing the address book still needs opposition:manage.
--
-- Why a new helper. has_capability takes a specific scope and matches either an
-- organisation-scoped assignment or one exact scope_id. `pitches:book` reaches a
-- coach through a TEAM-scoped assignment, and none of these three tables carries
-- a team_id to check against, so there is no scope_id to pass. The question here
-- is genuinely different: does this member hold the capability anywhere in this
-- organisation? That is what decides whether showing them the club's pitch list
-- is reasonable.
--
-- This is deliberately weaker than can_access_team and must not be used to
-- authorise a write. A coach seeing every pitch in the club is fine and
-- necessary; a coach booking one for a team they do not staff is not, and
-- book_pitch_for_event still checks can_access_team for that.

create function public.holds_capability_anywhere(
  requested_organisation_id uuid,
  requested_capability text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships membership
    join public.organisations organisation
      on organisation.id = membership.organisation_id
    join public.scoped_role_assignments assignment
      on assignment.membership_id = membership.id
      and assignment.organisation_id = membership.organisation_id
    join public.roles role
      on role.id = assignment.role_id
      and role.organisation_id = membership.organisation_id
    join public.role_permissions role_permission
      on role_permission.role_id = role.id
      and role_permission.organisation_id = role.organisation_id
    join public.permissions permission
      on permission.id = role_permission.permission_id
    where membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.organisation_id = requested_organisation_id
      and organisation.status = 'active'
      and permission.key = requested_capability
  );
$$;

comment on function public.holds_capability_anywhere(uuid, text) is
  'True when the caller holds the capability at any scope in the organisation. For read access to club-wide reference lists only; never use it to authorise a write.';

revoke all on function public.holds_capability_anywhere(uuid, text) from public;
grant execute on function public.holds_capability_anywhere(uuid, text) to authenticated;

-- Additional SELECT policies. PostgreSQL ORs permissive policies together, so
-- these widen the existing reads without altering who may write.

create policy reservation_units_view_booker
on public.reservation_units for select to authenticated
using (public.holds_capability_anywhere(organisation_id, 'pitches:book'));

create policy venues_view_booker
on public.venues for select to authenticated
using (public.holds_capability_anywhere(organisation_id, 'pitches:book'));

create policy facilities_view_booker
on public.facilities for select to authenticated
using (public.holds_capability_anywhere(organisation_id, 'pitches:book'));

-- opposition_contacts_scoped is `for all` on opposition:manage, so team staff
-- could not even read the address book to name an opponent. Reading it is not
-- sensitive: it is club names and a fixtures secretary's contact details, held by
-- the club itself. Editing it still needs opposition:manage.
create policy opposition_contacts_view_fixture_staff
on public.opposition_contacts for select to authenticated
using (public.holds_capability_anywhere(organisation_id, 'fixtures:manage'));
