begin;

select plan(14);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'organisations', 'organisations table exists');
select has_table('public', 'memberships', 'memberships table exists');
select has_table('public', 'roles', 'roles table exists');
select has_table('public', 'permissions', 'permissions table exists');
select has_table('public', 'role_permissions', 'role permissions table exists');
select has_table(
  'public',
  'scoped_role_assignments',
  'scoped role assignments table exists'
);
select has_table(
  'public',
  'organisation_settings',
  'organisation settings table exists'
);
select has_table('public', 'entitlements', 'entitlements table exists');
select has_table('public', 'seasons', 'seasons table exists');
select has_table(
  'public',
  'organisation_invites',
  'organisation invites table exists'
);
select has_column(
  'public',
  'memberships',
  'organisation_id',
  'memberships are tenant scoped'
);
select has_column(
  'public',
  'scoped_role_assignments',
  'scope_kind',
  'assignments declare their scope kind'
);
select has_function(
  'public',
  'has_capability',
  array['uuid', 'text', 'public.scope_kind', 'uuid', 'text'],
  'scoped capability helper exists'
);

select * from finish();
rollback;
