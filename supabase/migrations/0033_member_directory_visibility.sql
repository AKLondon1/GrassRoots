-- Let a club administrator see the names of the people whose roles they manage.
--
-- 0032 gave `assign_role` and `revoke_role` a callable surface, and the people-and-
-- access screen is what calls them. That screen has to name a membership, and the
-- only SELECT policy on public.profiles is `profiles_select_own`:
--
--   create policy profiles_select_own
--   on public.profiles for select to authenticated
--   using (id = auth.uid());
--
-- So the embedded `profiles(display_name)` join every member list uses returns the
-- caller's own name and NULL for everyone else. features/screens/production-governance.tsx
-- already reads memberships that way, which means its member list has been rendering
-- blank names rather than failing loudly. An admin cannot assign a role to a person
-- they cannot name, and a dropdown of bare membership UUIDs is the same defect class
-- 0026 fixed: offering a control that cannot be used.
--
-- SCOPED TO A SHARED ORGANISATION, not to "any authenticated user". The predicate
-- reads: this profile belongs to someone with an active membership of an organisation
-- in which the CALLER holds `memberships:view`. holds_capability_anywhere is security
-- definer and resolves the caller from auth.uid(), so a member of another club matches
-- nothing here. Two clubs that happen to share a member do not thereby see each other.
--
-- READ ONLY. `profiles_update_own` is untouched, so nobody gains the ability to edit
-- anyone else's profile. Permissive policies are ORed, so this widens SELECT without
-- narrowing or replacing the existing self-read.

create policy profiles_select_fellow_members
on public.profiles for select to authenticated
using (
  exists (
    select 1
    from public.memberships subject
    where subject.user_id = profiles.id
      and subject.status = 'active'
      and public.holds_capability_anywhere(
            subject.organisation_id, 'memberships:view'
          )
  )
);

comment on policy profiles_select_fellow_members on public.profiles is
  'A member holding memberships:view may read the display names of active members of that same organisation. Never widens write access.';
