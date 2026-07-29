-- Canonical role model.
--
-- Three defects this fixes:
--
-- 1. Eight screens were gated on capability strings absent from public.permissions,
--    so no role could ever grant them and the screens were unreachable for everyone.
--    parent/home and coach/compose are among them, which Phase 1 depends on.
-- 2. create_organisation provisioned only an `owner` role holding eight permissions.
--    A real club had no club-admin, manager, coach or guardian role to assign, so it
--    could not add a coach or a parent at all. Only the demo organisation worked,
--    because seed.sql builds those roles by hand.
-- 3. `manager` held teams:manage, so team staff could create teams. Only club
--    administrators should.
--
-- The role model now lives in one function, applied both to existing organisations
-- and to every organisation created from here on, so the two cannot drift.

insert into public.permissions (key, description) values
  ('family:view', 'View the household home and child profiles'),
  ('family:respond', 'Respond to outstanding household actions'),
  ('messages:view', 'Read messages addressed to the household'),
  ('help:view', 'View household help and support content'),
  ('club:view', 'View the club overview'),
  ('announcements:manage', 'Send announcements and change notices to a team'),
  ('fixtures:manage', 'Arrange fixtures against opposition clubs'),
  ('pitches:book', 'Reserve an existing pitch slot without managing pitch definitions')
on conflict (key) do nothing;

create or replace function public.apply_standard_role_model(
  target_organisation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Platform operations. Never granted to a club role.
  platform_only text[] := array[
    'access:manage', 'analytics:view', 'features:manage', 'health:view',
    'plans:manage', 'platform:view', 'providers:view', 'support:manage'
  ];
  -- Manager and coach deliberately share one set: the manager does the heavy
  -- lifting and delegates to the coach, so a coach can add parents too.
  -- teams:manage is absent on purpose; only club administrators create teams.
  team_staff text[] := array[
    'announcements:manage', 'announcements:view', 'attendance:manage',
    'availability:manage', 'development:manage', 'events:manage', 'events:view',
    'fixtures:manage', 'invitations:manage', 'matches:manage', 'people:manage',
    'pitches:book', 'players:view', 'polls:manage', 'polls:respond', 'reports:view',
    'squads:manage', 'squads:view', 'team:view', 'training:manage', 'volunteers:view'
  ];
  guardian_caps text[] := array[
    'announcements:view', 'availability:respond', 'calendar:manage',
    'consents:respond', 'development:view-approved', 'events:view', 'family:respond',
    'family:view', 'help:view', 'household:manage', 'messages:view',
    'notifications:manage', 'payments:view', 'polls:respond', 'squads:respond',
    'squads:view', 'team:view'
  ];
begin
  insert into public.roles (organisation_id, key, name) values
    (target_organisation_id, 'club-admin', 'Club administrator'),
    (target_organisation_id, 'manager', 'Team manager'),
    (target_organisation_id, 'coach', 'Coach'),
    (target_organisation_id, 'guardian', 'Guardian')
  on conflict (organisation_id, key) do nothing;

  -- Club-wide roles hold everything that is not platform operations. This also
  -- settles `owner` holding fewer permissions than `club-admin`: they are equal,
  -- because the club owner and the club administrator are the same authority.
  insert into public.role_permissions (organisation_id, role_id, permission_id)
  select target_organisation_id, role.id, permission.id
  from public.roles role
  cross join public.permissions permission
  where role.organisation_id = target_organisation_id
    and role.key in ('club-admin', 'owner')
    and not (permission.key = any(platform_only))
  on conflict (organisation_id, role_id, permission_id) do nothing;

  insert into public.role_permissions (organisation_id, role_id, permission_id)
  select target_organisation_id, role.id, permission.id
  from public.roles role
  join public.permissions permission on permission.key = any(team_staff)
  where role.organisation_id = target_organisation_id
    and role.key in ('manager', 'coach')
  on conflict (organisation_id, role_id, permission_id) do nothing;

  insert into public.role_permissions (organisation_id, role_id, permission_id)
  select target_organisation_id, role.id, permission.id
  from public.roles role
  join public.permissions permission on permission.key = any(guardian_caps)
  where role.organisation_id = target_organisation_id
    and role.key = 'guardian'
  on conflict (organisation_id, role_id, permission_id) do nothing;

  -- Withdraw anything outside the canonical set, so the function is the single
  -- source of truth rather than only ever adding. This is what removes
  -- teams:manage from `manager`.
  delete from public.role_permissions grant_row
  using public.roles role, public.permissions permission
  where grant_row.organisation_id = target_organisation_id
    and grant_row.role_id = role.id
    and grant_row.permission_id = permission.id
    and role.organisation_id = target_organisation_id
    and (
      (role.key in ('manager', 'coach') and not (permission.key = any(team_staff)))
      or (role.key = 'guardian' and not (permission.key = any(guardian_caps)))
      or (role.key in ('club-admin', 'owner') and permission.key = any(platform_only))
    );
end;
$$;

revoke all on function public.apply_standard_role_model(uuid) from public;

-- Manager and coach carry people:manage so team staff can add parents and players.
-- That permission is only safe at team scope: assigned across the organisation it
-- would satisfy the org-wide people:manage policies on players and guardians and
-- hand every coach the whole club's family records. Refuse such an assignment
-- outright rather than relying on the caller to get it right.
create or replace function public.enforce_team_scoped_staff_roles()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  assigned_key text;
begin
  select role.key into assigned_key
  from public.roles role
  where role.id = new.role_id and role.organisation_id = new.organisation_id;

  -- Only organisation scope is refused. That is the scope the org-wide
  -- people:manage policies on players, guardians and player_guardians check, so it
  -- is the one that would expose every family. A resource-scoped grant, such as a
  -- coach against a single pitch, satisfies no organisation-scoped policy and is
  -- left alone.
  if assigned_key in ('manager', 'coach') and new.scope_kind = 'organisation' then
    raise exception 'Manager and coach roles cannot be granted across the whole club'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger scoped_role_assignments_team_scoped_staff
before insert or update of role_id, scope_kind, scope_id
on public.scoped_role_assignments
for each row execute function public.enforce_team_scoped_staff_roles();

-- Every organisation created from here on. Same body as 0016 up to the owner role
-- assignment, then the standard role model, so a new club can immediately appoint a
-- manager, coach or guardian instead of having only an eight-permission owner.
create or replace function public.create_organisation(
  organisation_name text,
  organisation_slug text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_organisation_id uuid;
  owner_membership_id uuid;
  owner_role_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.organisations (name, slug)
  values (btrim(organisation_name), lower(btrim(organisation_slug)))
  returning id into created_organisation_id;

  insert into public.memberships (
    organisation_id, user_id, status, joined_at
  )
  values (created_organisation_id, auth.uid(), 'active', now())
  returning id into owner_membership_id;

  insert into public.organisation_settings (organisation_id)
  values (created_organisation_id);

  insert into public.roles (organisation_id, key, name)
  values (created_organisation_id, 'owner', 'Organisation owner')
  returning id into owner_role_id;

  -- Provisions club-admin, manager, coach and guardian, and grants `owner` the
  -- full club permission set rather than the previous eight.
  perform public.apply_standard_role_model(created_organisation_id);

  insert into public.scoped_role_assignments (
    organisation_id, membership_id, role_id, scope_kind, scope_id
  )
  values (
    created_organisation_id,
    owner_membership_id,
    owner_role_id,
    'organisation',
    created_organisation_id
  );

  return created_organisation_id;
end;
$$;

revoke all on function public.create_organisation(text, text) from public;
grant execute on function public.create_organisation(text, text) to authenticated;

-- Existing organisations, including the seeded demo club.
do $$
declare
  organisation_row record;
begin
  for organisation_row in select id from public.organisations loop
    perform public.apply_standard_role_model(organisation_row.id);
  end loop;
end;
$$;
