begin;

select plan(40);

select has_table('public', 'venues', 'venues table exists');
select has_table('public', 'facilities', 'facilities table exists');
select has_table('public', 'reservation_units', 'atomic reservation units table exists');
select has_table('public', 'reservation_unit_exclusions', 'unit exclusions table exists');
select has_table('public', 'facility_bookings', 'buffered bookings table exists');
select has_table('public', 'facility_inspections', 'inspections table exists');
select has_table('public', 'facility_closures', 'closures table exists');
select has_table('public', 'maintenance_requests', 'maintenance table exists');
select has_table('public', 'club_document_versions', 'versioned documents table exists');
select has_table('public', 'equipment_reservations', 'equipment reservations table exists');
select has_table('public', 'volunteer_shifts', 'volunteer rota table exists');
select has_table('public', 'support_sessions', 'support sessions table exists');
select has_table('public', 'facility_notification_outbox', 'urgent facility notification outbox exists');
select has_function('public', 'allocate_facility_booking', array['uuid','uuid','uuid','text','timestamp with time zone','timestamp with time zone','integer','integer'], 'allocation RPC exists');
select has_function('public', 'close_and_relocate_facility_bookings', array['uuid','uuid','timestamp with time zone','timestamp with time zone','text','jsonb'], 'closure and relocation RPC exists');
select has_function('public', 'start_support_session', array['uuid','uuid','text','integer'], 'time-limited audited support RPC exists');
select has_function('public', 'reserve_equipment', array['uuid','uuid','uuid','integer','timestamp with time zone','timestamp with time zone'], 'capacity-safe equipment RPC exists');
select has_function('public', 'revoke_support_session', array['uuid','text'], 'support revocation RPC exists');
select has_function('public', 'read_support_resource', array['uuid','text','uuid'], 'audited support resource RPC exists');
select has_trigger('public', 'reservation_units', 'reservation_units_validate_parent', 'reservation-unit cycles are guarded');

select ok(not has_table_privilege('authenticated', 'public.facility_closures', 'INSERT'), 'closure inserts are RPC-only');

select ok(exists (select 1 from public.roles where key = 'pitch-admin'), 'fictional pitch administrator role is seeded');
select ok(exists (select 1 from public.roles where key = 'facilities-admin'), 'fictional facilities administrator role is seeded');
select ok(exists (select 1 from public.roles where key = 'fixture-secretary'), 'fictional fixture secretary role is seeded');
select ok(exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id and r.organisation_id = rp.organisation_id join public.permissions p on p.id = rp.permission_id where r.key = 'pitch-admin' and p.key = 'pitches:inspect'), 'pitch administrators receive inspection permission');
select ok(exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id and r.organisation_id = rp.organisation_id join public.permissions p on p.id = rp.permission_id where r.key = 'facilities-admin' and p.key = 'equipment:manage'), 'facilities administrators receive equipment permission');
select ok(exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id and r.organisation_id = rp.organisation_id join public.permissions p on p.id = rp.permission_id where r.key = 'fixture-secretary' and p.key = 'pitches:manage'), 'fixture secretaries receive pitch allocation permission');

select ok(
  public.reservation_units_conflict(
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000002021',
    '00000000-0000-4000-8000-000000002022'
  ),
  'whole pitch conflicts with its subdivision'
);

select ok(
  public.reservation_units_conflict(
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000002024',
    '00000000-0000-4000-8000-000000002025'
  ),
  'explicit exclusion conflicts in either direction'
);

select ok(
  exists (
    select 1 from public.role_permissions role_permission
    join public.roles role on role.id = role_permission.role_id and role.organisation_id = role_permission.organisation_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.key = 'club-admin' and permission.key = 'pitches:manage'
  ),
  'club administrators receive facility permissions'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000201', true);
select throws_ok(
  $$select public.allocate_facility_booking(
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000002024', null, 'Unauthorised booking',
    '2026-08-10T09:00:00Z', '2026-08-10T10:00:00Z', 0, 0
  )$$,
  '42501', null,
  'a guardian cannot allocate facilities'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000203', true);
select lives_ok(
  $$select public.allocate_facility_booking(
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000002024', null, 'Authorised booking',
    '2026-08-10T09:00:00Z', '2026-08-10T10:00:00Z', 15, 20
  )$$,
  'club administrator can allocate a conflict-free facility'
);
select throws_ok(
  $$select public.allocate_facility_booking(
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000002025', null, 'Excluded area overlap',
    '2026-08-10T09:10:00Z', '2026-08-10T09:50:00Z', 0, 0
  )$$,
  '23P01', null,
  'an explicitly excluded reservation unit cannot overlap'
);
reset role;

select is(
  (select count(*) from public.support_sessions where expires_at > starts_at + interval '60 minutes'),
  0::bigint,
  'support sessions never exceed the maximum duration'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000203', true);
select lives_ok(
  $$select public.close_and_relocate_facility_bookings(
    '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000002021',
    '2026-08-09T08:00:00Z', '2026-08-09T12:00:00Z', 'Waterlogged after inspection',
    '{"00000000-0000-4000-8000-000000002041":"cancel"}'::jsonb
  )$$,
  'authorised closure can atomically cancel an affected booking'
);
select is(
  (select status from public.facility_bookings where id = '00000000-0000-4000-8000-000000002041'),
  'cancelled',
  'cancelled closure outcome is durable inside the transaction'
);
select is((select status::text from public.event_instances where id = '00000000-0000-4000-8000-000000001202'), 'cancelled', 'connected event instance is cancelled atomically');
select is((select cancelled_reason from public.event_instances where id = '00000000-0000-4000-8000-000000001202'), 'Waterlogged after inspection', 'cancellation reason satisfies the canonical event invariant');
select is((select count(*) from public.facility_notification_outbox where event_instance_id = '00000000-0000-4000-8000-000000001202' and kind = 'event-cancelled'), 1::bigint, 'one urgent cancellation notice is queued');
select is((select count(*) from public.private_calendar_events(repeat('b', 64)) where event_id = '00000000-0000-4000-8000-000000001202'), 0::bigint, 'cancelled event disappears from private calendar feeds');
reset role;

select * from finish();
rollback;
