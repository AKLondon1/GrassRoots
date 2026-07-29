begin;

select plan(15);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000009001', 'alex@example.test'),
  ('00000000-0000-4000-8000-000000009002', 'sam@example.test');

insert into public.organisations (id, name, slug, status)
values
  ('00000000-0000-4000-8000-000000001001', 'Riverside Juniors', 'permissions-riverside-juniors', 'active'),
  ('00000000-0000-4000-8000-000000001002', 'Northfield Juniors', 'northfield-juniors', 'active'),
  ('00000000-0000-4000-8000-000000001003', 'Closed Juniors', 'closed-juniors', 'suspended');

insert into public.memberships (
  id,
  organisation_id,
  user_id,
  status,
  joined_at
)
values
  (
    '00000000-0000-4000-8000-000000002001',
    '00000000-0000-4000-8000-000000001001',
    '00000000-0000-4000-8000-000000009001',
    'active',
    now()
  ),
  (
    '00000000-0000-4000-8000-000000002002',
    '00000000-0000-4000-8000-000000001002',
    '00000000-0000-4000-8000-000000009002',
    'active',
    now()
  ),
  (
    '00000000-0000-4000-8000-000000002003',
    '00000000-0000-4000-8000-000000001003',
    '00000000-0000-4000-8000-000000009001',
    'active',
    now()
  );

insert into public.roles (id, organisation_id, key, name)
values (
  '00000000-0000-4000-8000-000000003001',
  '00000000-0000-4000-8000-000000001001',
  -- Deliberately not keyed 'coach'. This file asserts that RLS refuses a member
  -- escalating their own organisation-scoped assignment, and 0020_role_model.sql
  -- adds a BEFORE trigger refusing club-wide manager and coach grants outright.
  -- Postgres runs BEFORE triggers ahead of RLS, so a 'coach' fixture here would be
  -- refused by the trigger and the RLS check would never be exercised.
  'scoped-role',
  'Scoped role'
);

insert into public.role_permissions (
  id,
  organisation_id,
  role_id,
  permission_id
)
select
  '00000000-0000-4000-8000-000000005001',
  '00000000-0000-4000-8000-000000001001',
  '00000000-0000-4000-8000-000000003001',
  permission.id
from public.permissions permission
where permission.key = 'events:manage'
on conflict (organisation_id, role_id, permission_id) do nothing;

insert into public.seasons (id, organisation_id, name, starts_on, ends_on)
values (
  '00000000-0000-4000-8000-000000007000',
  '00000000-0000-4000-8000-000000001001',
  'Permission test season',
  '2026-08-01',
  '2027-05-31'
);

insert into public.age_groups (id, organisation_id, name, minimum_age, maximum_age)
values (
  '00000000-0000-4000-8000-000000007010',
  '00000000-0000-4000-8000-000000001001',
  'Permission test age group',
  9,
  11
);

insert into public.teams (id, organisation_id, season_id, age_group_id, name)
values (
  '00000000-0000-4000-8000-000000007001',
  '00000000-0000-4000-8000-000000001001',
  '00000000-0000-4000-8000-000000007000',
  '00000000-0000-4000-8000-000000007010',
  'Permission test team'
);

insert into public.scoped_role_assignments (
  id,
  organisation_id,
  membership_id,
  role_id,
  scope_kind,
  scope_id,
  resource_type
)
values
  (
    '00000000-0000-4000-8000-000000006001',
    '00000000-0000-4000-8000-000000001001',
    '00000000-0000-4000-8000-000000002001',
    '00000000-0000-4000-8000-000000003001',
    'team',
    '00000000-0000-4000-8000-000000007001',
    null
  ),
  (
    '00000000-0000-4000-8000-000000006002',
    '00000000-0000-4000-8000-000000001001',
    '00000000-0000-4000-8000-000000002001',
    '00000000-0000-4000-8000-000000003001',
    'resource',
    '00000000-0000-4000-8000-000000008001',
    'pitch'
  );

create function pg_temp.try_cross_organisation_membership_update()
returns bigint
language plpgsql
as $$
declare
  affected bigint;
begin
  update public.memberships
  set status = 'suspended'
  where id = '00000000-0000-4000-8000-000000002002';
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create function pg_temp.try_cross_organisation_membership_delete()
returns bigint
language plpgsql
as $$
declare
  affected bigint;
begin
  delete from public.memberships
  where id = '00000000-0000-4000-8000-000000002002';
  get diagnostics affected = row_count;
  return affected;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000009001',
  true
);

select ok(
  public.has_active_membership('00000000-0000-4000-8000-000000001001'),
  'active membership resolves only for the current adult'
);
select is(
  public.has_active_membership('00000000-0000-4000-8000-000000001003'),
  false,
  'suspended organisations revoke membership access'
);
select ok(
  public.has_capability(
    '00000000-0000-4000-8000-000000001001',
    'events:manage',
    'team',
    '00000000-0000-4000-8000-000000007001',
    null
  ),
  'team permission resolves for its assigned team'
);
select is(
  public.has_capability(
    '00000000-0000-4000-8000-000000001001',
    'events:manage',
    'team',
    '00000000-0000-4000-8000-000000007002',
    null
  ),
  false,
  'team permission does not broaden to another team'
);
select ok(
  public.has_capability(
    '00000000-0000-4000-8000-000000001001',
    'events:manage',
    'resource',
    '00000000-0000-4000-8000-000000008001',
    'pitch'
  ),
  'resource permission resolves for its exact type and id'
);
select is(
  public.has_capability(
    '00000000-0000-4000-8000-000000001001',
    'events:manage',
    'resource',
    '00000000-0000-4000-8000-000000008001',
    'document'
  ),
  false,
  'resource permission does not broaden across resource types'
);
select is(
  public.has_capability(
    '00000000-0000-4000-8000-000000001002',
    'events:manage',
    'team',
    '00000000-0000-4000-8000-000000007001',
    null
  ),
  false,
  'permission does not cross organisation boundaries'
);
select is(
  (
    select count(*)
    from public.memberships
    where organisation_id = '00000000-0000-4000-8000-000000001002'
  ),
  0::bigint,
  'RLS hides another organisation membership'
);
select throws_ok(
  $$
    insert into public.memberships (organisation_id, user_id, status)
    values (
      '00000000-0000-4000-8000-000000001002',
      '00000000-0000-4000-8000-000000009001',
      'invited'
    )
  $$,
  '42501',
  null,
  'RLS denies a cross-organisation membership insert'
);
select is(
  pg_temp.try_cross_organisation_membership_update(),
  0::bigint,
  'RLS prevents cross-organisation membership updates'
);
select is(
  pg_temp.try_cross_organisation_membership_delete(),
  0::bigint,
  'RLS prevents cross-organisation membership deletes'
);
select throws_ok(
  $$
    insert into public.scoped_role_assignments (
      organisation_id,
      membership_id,
      role_id,
      scope_kind,
      scope_id
    )
    values (
      '00000000-0000-4000-8000-000000001001',
      '00000000-0000-4000-8000-000000002001',
      '00000000-0000-4000-8000-000000003001',
      'organisation',
      '00000000-0000-4000-8000-000000001001'
    )
  $$,
  '42501',
  null,
  'a member cannot escalate their own role assignment'
);
select lives_ok(
  $$select public.create_organisation('Alex FC', 'alex-fc')$$,
  'an authenticated adult can safely bootstrap an organisation'
);
select ok(
  exists (
    select 1
    from public.scoped_role_assignments assignment
    join public.roles role on role.id = assignment.role_id
    join public.organisations organisation on organisation.id = assignment.organisation_id
    where organisation.slug = 'alex-fc'
      and role.key = 'owner'
      and assignment.scope_kind = 'organisation'
  ),
  'organisation bootstrap creates an organisation-scoped owner assignment'
);

reset role;
update public.memberships
set status = 'suspended'
where id = '00000000-0000-4000-8000-000000002001';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000009001',
  true
);
select is(
  public.has_capability(
    '00000000-0000-4000-8000-000000001001',
    'events:manage',
    'team',
    '00000000-0000-4000-8000-000000007001',
    null
  ),
  false,
  'inactive membership revokes assigned capabilities'
);

select * from finish();
rollback;
