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
  ('00000000-0000-4000-8000-000000000f05', '00000000-0000-4000-8000-000000000101', 'manager', 'Team manager'),
  ('00000000-0000-4000-8000-000000000f06', '00000000-0000-4000-8000-000000000101', 'pitch-admin', 'Pitch administrator'),
  ('00000000-0000-4000-8000-000000000f07', '00000000-0000-4000-8000-000000000101', 'facilities-admin', 'Facilities administrator'),
  ('00000000-0000-4000-8000-000000000f08', '00000000-0000-4000-8000-000000000101', 'fixture-secretary', 'Fixture secretary')
on conflict (id) do nothing;

insert into public.role_permissions (organisation_id, role_id, permission_id)
select '00000000-0000-4000-8000-000000000101', role.id, permission.id
from public.roles role
join public.permissions permission on (
  (role.key = 'guardian' and permission.key in (
    'announcements:view', 'availability:respond', 'calendar:manage', 'events:view',
    'household:manage', 'polls:respond', 'squads:respond', 'squads:view', 'team:view'
  ))
  or (role.key = 'coach' and permission.key in (
    'announcements:view', 'availability:manage', 'attendance:manage', 'events:manage',
    'events:view', 'players:view', 'polls:manage', 'polls:respond', 'squads:manage',
    'squads:view', 'team:view', 'volunteers:view'
  ))
  or (role.key = 'club-admin' and permission.key in (
    'club:manage', 'household:manage', 'invitations:manage', 'memberships:manage',
    'memberships:view', 'opposition:manage', 'people:manage', 'players:view',
    'roles:manage', 'seasons:manage', 'settings:manage', 'team:view',
    'teams:manage', 'volunteers:view', 'announcements:view', 'availability:manage',
    'availability:respond', 'attendance:manage', 'calendar:manage', 'events:manage',
    'events:view', 'polls:manage', 'polls:respond', 'squads:manage',
    'squads:respond', 'squads:view'
  ))
  or (role.key = 'manager' and permission.key in (
    'announcements:view', 'availability:manage', 'attendance:manage', 'events:manage',
    'events:view', 'invitations:manage', 'players:view', 'polls:manage',
    'polls:respond', 'squads:manage', 'squads:view', 'team:view', 'teams:manage',
    'volunteers:view'
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
  ('00000000-0000-4000-8000-000000001005', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-000000000f01', 'organisation', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000001006', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000f06', 'organisation', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000001007', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000f07', 'organisation', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000001008', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000f08', 'organisation', '00000000-0000-4000-8000-000000000101')
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

-- Fictional facility and club-operations records for the Riverside Juniors demo.
insert into public.venues (id, organisation_id, name, address, time_zone, step_free_access)
values ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000000101', 'Riverside Sports Ground', 'Mill Lane, Riverside', 'Europe/London', true)
on conflict (id) do nothing;

insert into public.facilities (id, organisation_id, venue_id, name, kind)
values
  ('00000000-0000-4000-8000-000000002011', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000002001', 'Main pitch', 'pitch'),
  ('00000000-0000-4000-8000-000000002012', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000002001', 'Pitch 2', 'pitch'),
  ('00000000-0000-4000-8000-000000002013', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000002001', 'Training area', 'training-area')
on conflict (id) do nothing;

insert into public.reservation_units (id, organisation_id, facility_id, parent_unit_id, name, capacity, accessible, floodlit)
values
  ('00000000-0000-4000-8000-000000002021', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000002011', null, 'Main pitch', 22, true, false),
  ('00000000-0000-4000-8000-000000002022', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000002011', '00000000-0000-4000-8000-000000002021', 'Main pitch · half A', 12, true, false),
  ('00000000-0000-4000-8000-000000002023', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000002011', '00000000-0000-4000-8000-000000002021', 'Main pitch · half B', 12, true, false),
  ('00000000-0000-4000-8000-000000002024', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000002012', null, 'Pitch 2', 18, true, true),
  ('00000000-0000-4000-8000-000000002025', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000002013', null, 'Training area', 10, false, true)
on conflict (id) do nothing;

insert into public.reservation_unit_exclusions (id, organisation_id, reservation_unit_id, excluded_unit_id, reason)
values ('00000000-0000-4000-8000-000000002031', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000002024', '00000000-0000-4000-8000-000000002025', 'Shared safety run-off area')
on conflict (id) do nothing;

insert into public.facility_bookings (id, organisation_id, reservation_unit_id, event_instance_id, title, starts_at, ends_at, buffer_before_minutes, buffer_after_minutes, created_by_membership_id)
values ('00000000-0000-4000-8000-000000002041', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000002021', null, 'Under 11s v Meadow Park Juniors', '2026-08-09T09:00:00Z', '2026-08-09T10:30:00Z', 15, 20, '00000000-0000-4000-8000-000000000303')
on conflict (id) do nothing;

insert into public.facility_inspections (id, organisation_id, reservation_unit_id, inspected_by_membership_id, inspected_at, outcome, notes)
values ('00000000-0000-4000-8000-000000002051', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000002021', '00000000-0000-4000-8000-000000000303', '2026-07-21T07:40:00Z', 'monitor', 'Waterlogged area near the south touchline; goals secure and access route clear.')
on conflict (id) do nothing;

insert into public.maintenance_requests (id, organisation_id, facility_id, title, description, priority, status, assigned_membership_id, due_on)
values ('00000000-0000-4000-8000-000000002061', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000002011', 'Repair drainage channel', 'Clear and repair the south-side drainage channel.', 'high', 'planned', '00000000-0000-4000-8000-000000000303', '2026-08-01')
on conflict (id) do nothing;

insert into public.club_documents (id, organisation_id, title, required_capability, current_version)
values ('00000000-0000-4000-8000-000000002071', '00000000-0000-4000-8000-000000000101', 'Pitch allocation policy', 'documents:manage', 3)
on conflict (id) do nothing;

insert into public.club_document_versions (id, organisation_id, document_id, version, storage_path, checksum, created_by_membership_id)
values ('00000000-0000-4000-8000-000000002072', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000002071', 3, 'demo/riverside/pitch-allocation-v3.pdf', 'demo-checksum-v3', '00000000-0000-4000-8000-000000000303')
on conflict (id) do nothing;

insert into public.equipment_items (id, organisation_id, name, quantity, asset_tag)
values ('00000000-0000-4000-8000-000000002081', '00000000-0000-4000-8000-000000000101', 'Under 11 match shirts', 18, 'KIT-U11-HOME')
on conflict (id) do nothing;

insert into public.equipment_reservations (id, organisation_id, equipment_item_id, event_id, quantity, starts_at, ends_at)
values ('00000000-0000-4000-8000-000000002082', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000002081', null, 18, '2026-08-09T08:15:00Z', '2026-08-09T11:00:00Z')
on conflict (id) do nothing;

insert into public.volunteer_shifts (id, organisation_id, event_id, title, starts_at, ends_at, required_people)
values ('00000000-0000-4000-8000-000000002091', '00000000-0000-4000-8000-000000000101', null, 'Match-day welcome desk', '2026-08-09T08:30:00Z', '2026-08-09T09:15:00Z', 1)
on conflict (id) do nothing;

insert into public.facility_blocks (id, organisation_id, reservation_unit_id, starts_at, ends_at, reason)
values ('00000000-0000-4000-8000-000000002101', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000002025', '2026-07-25T07:00:00Z', '2026-07-25T09:00:00Z', 'Council grounds work')
on conflict (id) do nothing;

insert into public.facility_closures (id, organisation_id, reservation_unit_id, inspection_id, starts_at, ends_at, reason, closed_by_membership_id)
values ('00000000-0000-4000-8000-000000002109', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000002021', '00000000-0000-4000-8000-000000002051', '2026-07-21T07:45:00Z', '2026-07-21T12:00:00Z', 'Waterlogged south touchline', '00000000-0000-4000-8000-000000000303')
on conflict (id) do nothing;

insert into public.facility_assets (id, organisation_id, facility_id, name, asset_tag, condition)
values ('00000000-0000-4000-8000-000000002102', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000002011', 'Portable goals', 'GOALS-MAIN-01', 'good')
on conflict (id) do nothing;

insert into public.external_hires (id, organisation_id, venue_id, supplier_name, reference, cost_pence, status)
values ('00000000-0000-4000-8000-000000002103', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000002001', 'Riverside Community Trust', '3G-AUG-09', 8500, 'requested')
on conflict (id) do nothing;

insert into public.volunteer_shift_assignments (id, organisation_id, shift_id, membership_id, status)
values ('00000000-0000-4000-8000-000000002104', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000002091', '00000000-0000-4000-8000-000000000303', 'offered')
on conflict (id) do nothing;

insert into public.support_requests (id, organisation_id, requested_by_membership_id, subject, description, authorised_resources, status)
values ('00000000-0000-4000-8000-000000002105', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000303', 'Booking relocation help', 'Please investigate fictional booking GR-18.', '[{"type":"facility_booking","id":"00000000-0000-4000-8000-000000002041"}]', 'investigating')
on conflict (id) do nothing;

insert into public.support_sessions (id, organisation_id, support_request_id, operator_membership_id, reason, starts_at, expires_at, allowed_resources, allowed_resource_ids)
values ('00000000-0000-4000-8000-000000002106', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000002105', '00000000-0000-4000-8000-000000000304', 'Investigate fictional booking reference GR-18', '2026-07-21T09:00:00Z', '2026-07-21T09:30:00Z', array['facility_booking'], array['00000000-0000-4000-8000-000000002041'::uuid])
on conflict (id) do nothing;

insert into public.export_audit (id, organisation_id, actor_membership_id, format, resource_type, watermark, row_count, created_at)
values ('00000000-0000-4000-8000-000000002107', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000303', 'csv', 'pitch-allocation', 'GrassRoots · Riverside Juniors · Confidential club export', 1, '2026-07-21T08:50:00Z')
on conflict (id) do nothing;

insert into public.audit_log (id, organisation_id, actor_membership_id, action, resource_type, resource_id, reason, metadata, created_at)
values ('00000000-0000-4000-8000-000000002108', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000303', 'facility.inspection.recorded', 'facility_inspection', '00000000-0000-4000-8000-000000002051', 'Routine fictional demo inspection', '{}', '2026-07-21T07:40:00Z')
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

insert into public.events (
  id, organisation_id, team_id, kind, title, default_location_name,
  created_by_membership_id
)
values
  ('00000000-0000-4000-8000-000000001201', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000802', 'training', 'Under 11s training', 'Riverside Sports Ground · Pitch 2', '00000000-0000-4000-8000-000000000302'),
  ('00000000-0000-4000-8000-000000001202', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000802', 'match', 'Under 11s v Meadow Park Juniors', 'Riverside Sports Ground · Main pitch', '00000000-0000-4000-8000-000000000302')
on conflict (id) do nothing;

insert into public.event_series (
  id, organisation_id, event_id, team_id, time_zone, recurrence_rule,
  starts_at, ends_at, until_at
)
values (
  '00000000-0000-4000-8000-000000001211',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000001201',
  '00000000-0000-4000-8000-000000000802',
  'Europe/London',
  '{"frequency":"weekly","interval":1,"localTime":"09:30"}',
  '2026-08-02T08:30:00Z',
  '2026-08-02T10:00:00Z',
  '2026-09-27T08:30:00Z'
)
on conflict (id) do nothing;

insert into public.event_instances (
  id, organisation_id, event_id, series_id, team_id, starts_at, ends_at,
  response_deadline, location_name, status
)
values
  ('00000000-0000-4000-8000-000000001201', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001201', '00000000-0000-4000-8000-000000001211', '00000000-0000-4000-8000-000000000802', '2026-08-02T08:30:00Z', '2026-08-02T10:00:00Z', '2026-07-30T17:00:00Z', 'Riverside Sports Ground · Pitch 2', 'scheduled'),
  ('00000000-0000-4000-8000-000000001202', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001202', null, '00000000-0000-4000-8000-000000000802', '2026-08-09T09:00:00Z', '2026-08-09T10:30:00Z', '2026-08-05T18:00:00Z', 'Riverside Sports Ground · Main pitch', 'scheduled'),
  ('00000000-0000-4000-8000-000000001203', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001201', '00000000-0000-4000-8000-000000001211', '00000000-0000-4000-8000-000000000802', '2026-08-16T09:30:00Z', '2026-08-16T11:00:00Z', '2026-08-13T17:00:00Z', 'Riverside Sports Ground · Pitch 3', 'scheduled')
on conflict (id) do nothing;

insert into public.event_exceptions (
  id, organisation_id, series_id, team_id, original_starts_at,
  replacement_instance_id, patch
)
values (
  '00000000-0000-4000-8000-000000001213',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000001211',
  '00000000-0000-4000-8000-000000000802',
  '2026-08-16T08:30:00Z',
  '00000000-0000-4000-8000-000000001203',
  '{"startsAt":"2026-08-16T09:30:00Z","locationName":"Riverside Sports Ground · Pitch 3"}'
)
on conflict (organisation_id, series_id, original_starts_at) do nothing;

insert into public.availability_responses (
  id, organisation_id, event_instance_id, team_id, player_id, guardian_id,
  status, idempotency_key, responded_at
)
values
  ('00000000-0000-4000-8000-000000001221', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001202', '00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000401', 'available', 'demo-jamie-match-availability', '2026-07-20T18:05:00Z'),
  ('00000000-0000-4000-8000-000000001222', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001202', '00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000603', '00000000-0000-4000-8000-000000000403', 'unsure', 'demo-rowan-match-availability', '2026-07-20T19:10:00Z')
on conflict (id) do nothing;

insert into public.polls (
  id, organisation_id, team_id, title, status, closes_at, created_by_membership_id
)
values (
  '00000000-0000-4000-8000-000000001301',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000802',
  'September training time', 'open', '2026-07-24T18:00:00Z',
  '00000000-0000-4000-8000-000000000302'
)
on conflict (id) do nothing;

insert into public.poll_options (
  id, organisation_id, poll_id, team_id, starts_at, ends_at, pitch_capacity
)
values
  ('00000000-0000-4000-8000-000000001311', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001301', '00000000-0000-4000-8000-000000000802', '2026-09-05T08:00:00Z', '2026-09-05T09:30:00Z', 10),
  ('00000000-0000-4000-8000-000000001312', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001301', '00000000-0000-4000-8000-000000000802', '2026-09-05T10:00:00Z', '2026-09-05T11:30:00Z', 9),
  ('00000000-0000-4000-8000-000000001313', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001301', '00000000-0000-4000-8000-000000000802', '2026-09-05T16:00:00Z', '2026-09-05T17:30:00Z', 7)
on conflict (id) do nothing;

insert into public.squads (
  id, organisation_id, event_instance_id, team_id, status, published_at,
  published_by_membership_id
)
values (
  '00000000-0000-4000-8000-000000001401',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000001202',
  '00000000-0000-4000-8000-000000000802',
  'published', '2026-07-20T20:00:00Z',
  '00000000-0000-4000-8000-000000000302'
)
on conflict (id) do nothing;

insert into public.squad_members (
  id, organisation_id, squad_id, team_id, player_id, status, position_order
)
values
  ('00000000-0000-4000-8000-000000001402', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001401', '00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000601', 'selected', 1),
  ('00000000-0000-4000-8000-000000001403', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001401', '00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000603', 'standby', 1)
on conflict (id) do nothing;

insert into public.squad_history (
  id, organisation_id, squad_id, squad_member_id, team_id, player_id,
  previous_status, next_status, reason, changed_by_membership_id, changed_at
)
values
  ('00000000-0000-4000-8000-000000001411', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001401', '00000000-0000-4000-8000-000000001402', '00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000601', null, 'selected', 'Initial publication', '00000000-0000-4000-8000-000000000302', '2026-07-20T20:00:00Z'),
  ('00000000-0000-4000-8000-000000001412', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001401', '00000000-0000-4000-8000-000000001403', '00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000603', null, 'standby', 'Initial publication', '00000000-0000-4000-8000-000000000302', '2026-07-20T20:00:00Z')
on conflict (id) do nothing;

insert into public.standby_replacements (
  id, organisation_id, squad_id, team_id, withdrawn_player_id,
  standby_player_id, status, expires_at
)
values (
  '00000000-0000-4000-8000-000000001421',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000001401',
  '00000000-0000-4000-8000-000000000802',
  '00000000-0000-4000-8000-000000000601',
  '00000000-0000-4000-8000-000000000603',
  'offered', '2026-08-07T18:00:00Z'
)
on conflict (id) do nothing;

insert into public.private_calendar_tokens (
  id, organisation_id, membership_id, token_digest, label
)
values (
  '00000000-0000-4000-8000-000000001501',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000301',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'Alex phone calendar'
)
on conflict (id) do nothing;

-- Link the earlier facility reservation after its canonical event instance exists.
update public.facility_bookings
set event_instance_id = '00000000-0000-4000-8000-000000001202'
where id = '00000000-0000-4000-8000-000000002041'
  and organisation_id = '00000000-0000-4000-8000-000000000101';
