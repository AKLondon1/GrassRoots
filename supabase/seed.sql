-- Deterministic, wholly fictional development data. No production or real-person data.
insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-000000000201', 'alex.morgan@example.test', '{"display_name":"Alex Morgan"}'),
  ('00000000-0000-4000-8000-000000000202', 'sam.taylor@example.test', '{"display_name":"Sam Taylor"}'),
  ('00000000-0000-4000-8000-000000000203', 'priya.shah@example.test', '{"display_name":"Priya Shah"}'),
  ('00000000-0000-4000-8000-000000000204', 'morgan.lee@example.test', '{"display_name":"Morgan Lee"}'),
  ('00000000-0000-4000-8000-000000000205', 'jordan.morgan@example.test', '{"display_name":"Jordan Morgan"}')
on conflict (id) do nothing;

insert into public.profiles (id, display_name, account_type)
values
  ('00000000-0000-4000-8000-000000000201', 'Alex Morgan', 'adult'),
  ('00000000-0000-4000-8000-000000000202', 'Sam Taylor', 'adult'),
  ('00000000-0000-4000-8000-000000000203', 'Priya Shah', 'adult'),
  ('00000000-0000-4000-8000-000000000204', 'Morgan Lee', 'adult'),
  ('00000000-0000-4000-8000-000000000205', 'Jordan Morgan', 'adult')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.organisations (id, name, slug, status)
values (
  '00000000-0000-4000-8000-000000000101',
  'Riverside Juniors',
  'riverside-juniors',
  'active'
)
on conflict (id) do nothing;

insert into public.organisation_settings (organisation_id)
values ('00000000-0000-4000-8000-000000000101')
on conflict (organisation_id) do nothing;

insert into public.memberships (id, organisation_id, user_id, status, joined_at)
values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000201', 'active', '2026-07-01T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000202', 'active', '2026-07-01T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000203', 'active', '2026-07-01T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000204', 'active', '2026-07-01T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000205', 'active', '2026-07-01T09:00:00Z')
on conflict (id) do nothing;

insert into public.roles (id, organisation_id, key, name)
values
  ('00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-000000000101', 'guardian', 'Guardian'),
  ('00000000-0000-4000-8000-000000000f02', '00000000-0000-4000-8000-000000000101', 'coach', 'Coach'),
  ('00000000-0000-4000-8000-000000000f03', '00000000-0000-4000-8000-000000000101', 'club-admin', 'Club administrator'),
  ('00000000-0000-4000-8000-000000000f04', '00000000-0000-4000-8000-000000000101', 'platform-operator', 'Platform operator'),
  ('00000000-0000-4000-8000-000000000f05', '00000000-0000-4000-8000-000000000101', 'manager', 'Team manager')
on conflict (id) do nothing;

insert into public.role_permissions (organisation_id, role_id, permission_id)
select '00000000-0000-4000-8000-000000000101', role.id, permission.id
from public.roles role
join public.permissions permission on (
  (role.key = 'guardian' and permission.key in ('household:manage', 'team:view'))
  or (role.key = 'coach' and permission.key in ('players:view', 'team:view', 'volunteers:view'))
  or (role.key = 'club-admin' and permission.key in (
    'club:manage', 'household:manage', 'invitations:manage', 'memberships:manage',
    'memberships:view', 'opposition:manage', 'people:manage', 'players:view',
    'roles:manage', 'seasons:manage', 'settings:manage', 'team:view',
    'teams:manage', 'volunteers:view'
  ))
  or (role.key = 'manager' and permission.key in (
    'invitations:manage', 'players:view', 'team:view', 'teams:manage', 'volunteers:view'
  ))
)
where role.organisation_id = '00000000-0000-4000-8000-000000000101'
on conflict (organisation_id, role_id, permission_id) do nothing;

insert into public.seasons (id, organisation_id, name, starts_on, ends_on, is_active)
values (
  '00000000-0000-4000-8000-000000000701',
  '00000000-0000-4000-8000-000000000101',
  '2026/27 season',
  '2026-08-01',
  '2027-05-31',
  true
)
on conflict (id) do nothing;

insert into public.age_groups (id, organisation_id, name, minimum_age, maximum_age)
values
  ('00000000-0000-4000-8000-000000000711', '00000000-0000-4000-8000-000000000101', 'Under 7', 5, 7),
  ('00000000-0000-4000-8000-000000000712', '00000000-0000-4000-8000-000000000101', 'Under 11', 9, 11)
on conflict (id) do nothing;

insert into public.teams (id, organisation_id, season_id, age_group_id, name)
values
  ('00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000711', 'Under 7s'),
  ('00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000712', 'Under 11s')
on conflict (id) do nothing;

insert into public.scoped_role_assignments (
  id, organisation_id, membership_id, role_id, scope_kind, scope_id
)
values
  ('00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000f01', 'organisation', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000001002', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000f02', 'team', '00000000-0000-4000-8000-000000000802'),
  ('00000000-0000-4000-8000-000000001003', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000f03', 'organisation', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000001004', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000f04', 'organisation', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000001005', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-000000000f01', 'organisation', '00000000-0000-4000-8000-000000000101')
on conflict (id) do nothing;

insert into public.players (id, organisation_id, first_name, last_name, date_of_birth)
values
  ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000101', 'Jamie', 'Morgan', '2015-10-12'),
  ('00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000101', 'Maya', 'Morgan', '2019-04-08'),
  ('00000000-0000-4000-8000-000000000603', '00000000-0000-4000-8000-000000000101', 'Rowan', 'Taylor', '2015-06-20')
on conflict (id) do nothing;

insert into public.guardians (id, organisation_id, membership_id, display_name, email, status)
values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000301', 'Alex Morgan', 'alex.morgan@example.test', 'active'),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000305', 'Jordan Morgan', 'jordan.morgan@example.test', 'active'),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000302', 'Sam Taylor', 'sam.taylor@example.test', 'active')
on conflict (id) do nothing;

insert into public.households (id, organisation_id, name)
values
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000101', 'Morgan household'),
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000101', 'Taylor household')
on conflict (id) do nothing;

insert into public.player_guardians (
  id, organisation_id, household_id, player_id, guardian_id, relationship
)
values
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000401', 'Parent'),
  ('00000000-0000-4000-8000-000000000902', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000401', 'Parent'),
  ('00000000-0000-4000-8000-000000000903', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000402', 'Parent'),
  ('00000000-0000-4000-8000-000000000904', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000603', '00000000-0000-4000-8000-000000000403', 'Parent')
on conflict (id) do nothing;

insert into public.guardian_permissions (
  id, organisation_id, player_guardian_id, communication, payments,
  consent, emergency_contact, restricted_contact
)
values
  ('00000000-0000-4000-8000-000000001101', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000901', true, true, true, true, false),
  ('00000000-0000-4000-8000-000000001102', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000902', true, false, true, true, false),
  ('00000000-0000-4000-8000-000000001103', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000903', false, false, false, false, true),
  ('00000000-0000-4000-8000-000000001104', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000904', true, true, true, true, false)
on conflict (id) do nothing;

insert into public.coaches (id, organisation_id, membership_id, display_name)
values ('00000000-0000-4000-8000-000000000a01', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000302', 'Sam Taylor')
on conflict (id) do nothing;

insert into public.volunteers (id, organisation_id, membership_id, display_name, kind)
values ('00000000-0000-4000-8000-000000000b01', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000303', 'Priya Shah', 'Registration helper')
on conflict (id) do nothing;

insert into public.team_memberships (
  id, organisation_id, team_id, member_kind, player_id, coach_id
)
values
  ('00000000-0000-4000-8000-000000000c01', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000802', 'player', '00000000-0000-4000-8000-000000000601', null),
  ('00000000-0000-4000-8000-000000000c02', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000801', 'player', '00000000-0000-4000-8000-000000000602', null),
  ('00000000-0000-4000-8000-000000000c03', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000802', 'player', '00000000-0000-4000-8000-000000000603', null),
  ('00000000-0000-4000-8000-000000000c04', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000802', 'coach', null, '00000000-0000-4000-8000-000000000a01')
on conflict (id) do nothing;

insert into public.opposition_contacts (id, organisation_id, club_name, display_name, email)
values ('00000000-0000-4000-8000-000000000d01', '00000000-0000-4000-8000-000000000101', 'Meadow Park Juniors', 'Drew Patel', 'fixtures.meadow-park@example.test')
on conflict (id) do nothing;

insert into public.organisation_invites (
  id, organisation_id, email, role_id, scope_kind, scope_id,
  token_digest, expires_at
)
values (
  '00000000-0000-4000-8000-000000000e01',
  '00000000-0000-4000-8000-000000000101',
  'manager.under7@example.test',
  '00000000-0000-4000-8000-000000000f05',
  'team',
  '00000000-0000-4000-8000-000000000801',
  'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  '2099-12-31T23:59:59Z'
)
on conflict (id) do nothing;
