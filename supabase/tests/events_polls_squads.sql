begin;

select plan(51);

select has_table('public', 'events', 'canonical events table exists');
select has_table('public', 'event_series', 'event series table exists');
select has_table('public', 'event_instances', 'event instances table exists');
select has_table('public', 'event_exceptions', 'event exceptions table exists');
select has_table('public', 'availability_responses', 'availability table exists');
select has_table('public', 'polls', 'polls table exists');
select has_table('public', 'poll_options', 'poll options table exists');
select has_table('public', 'poll_respondents', 'poll respondents table exists');
select has_table('public', 'poll_responses', 'poll responses table exists');
select has_table('public', 'squads', 'squads table exists');
select has_table('public', 'squad_history', 'squad history table exists');
select has_table('public', 'standby_replacements', 'standby replacement table exists');
select has_table('public', 'private_calendar_tokens', 'private calendar token table exists');
select has_column('public', 'polls', 'conversion_idempotency_key', 'poll conversion idempotency is durable');
select has_function('public', 'accept_standby_replacement', array['uuid'], 'standby acceptance RPC exists');
select has_function('public', 'private_calendar_events', array['text'], 'redacted private calendar query exists');
select has_function(
  'public', 'edit_recurring_event', array['uuid', 'uuid', 'timestamp with time zone', 'text', 'jsonb'],
  'recurrence edit RPC exists'
);
select ok(
  exists (
    select 1
    from public.role_permissions role_permission
    join public.roles role on role.id = role_permission.role_id and role.organisation_id = role_permission.organisation_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.key = 'guardian' and permission.key = 'availability:respond'
  ),
  'fresh seed roles receive Phase 2 permissions'
);

select is(
  (select count(*) from public.event_exceptions where original_starts_at = '2026-08-16T08:30:00Z'),
  1::bigint,
  'recurrence exception is scoped to one occurrence'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000201', true);

select throws_ok(
  $$
    insert into public.availability_responses (
      organisation_id, event_instance_id, team_id, player_id, guardian_id,
      status, idempotency_key
    ) values (
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000001202',
      '00000000-0000-4000-8000-000000000802',
      '00000000-0000-4000-8000-000000000602',
      '00000000-0000-4000-8000-000000000401',
      'available', 'cross-team-player-01'
    )
  $$,
  '23503',
  null,
  'cross-team availability is denied'
);

reset role;

select is(
  (select count(*) from public.squad_history where squad_id = '00000000-0000-4000-8000-000000001401'),
  2::bigint,
  'squad publication records immutable history'
);

select is(
  (select count(*) from public.resolve_private_calendar_token(repeat('b', 64))),
  1::bigint,
  'active calendar token resolves'
);

update public.private_calendar_tokens
set revoked_at = '2026-07-21T12:00:00Z'
where id = '00000000-0000-4000-8000-000000001501';

select is(
  (select count(*) from public.resolve_private_calendar_token(repeat('b', 64))),
  0::bigint,
  'revoked calendar token is rejected'
);

update public.private_calendar_tokens
set revoked_at = null
where id = '00000000-0000-4000-8000-000000001501';

savepoint edit_this;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000202', true);
select lives_ok(
  $$select public.edit_recurring_event(
    '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001211',
    '2026-08-02T08:30:00Z', 'this', '{"locationName":"Pitch 4"}'::jsonb
  )$$,
  'one-occurrence recurrence edit persists'
);
select is(
  (select location_name from public.event_instances where id = '00000000-0000-4000-8000-000000001201'),
  'Pitch 4',
  'one-occurrence recurrence edit changes only the selected instance'
);
select is(
  (select count(*) from public.event_exceptions where original_starts_at = '2026-08-02T08:30:00Z'),
  1::bigint,
  'one-occurrence recurrence edit records an exception'
);
select is(
  (select count(*) from public.event_change_summaries where edit_scope = 'this'),
  1::bigint,
  'one-occurrence recurrence edit records an auditable summary'
);
reset role;
rollback to savepoint edit_this;

savepoint edit_future;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000202', true);
select lives_ok(
  $$select public.edit_recurring_event(
    '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001211',
    '2026-08-16T09:30:00Z', 'this-and-future', '{"locationName":"Pitch 5"}'::jsonb
  )$$,
  'this-and-future recurrence edit persists'
);
select is(
  (select count(*) from public.event_series where event_id = '00000000-0000-4000-8000-000000001201'),
  2::bigint,
  'this-and-future recurrence edit splits the series'
);
select isnt(
  (select series_id from public.event_instances where id = '00000000-0000-4000-8000-000000001203'),
  '00000000-0000-4000-8000-000000001211'::uuid,
  'future instances move to the replacement series'
);
select is(
  (select count(*) from public.event_change_summaries where edit_scope = 'this-and-future'),
  1::bigint,
  'this-and-future recurrence edit records an auditable summary'
);
reset role;
rollback to savepoint edit_future;

savepoint edit_all;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000202', true);
select lives_ok(
  $$select public.edit_recurring_event(
    '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001211',
    '2026-08-02T08:30:00Z', 'all', '{"title":"Updated weekly training","locationName":"Pitch 6"}'::jsonb
  )$$,
  'all-occurrences recurrence edit persists'
);
select is(
  (select title from public.events where id = '00000000-0000-4000-8000-000000001201'),
  'Updated weekly training',
  'all-occurrences recurrence edit changes the canonical title'
);
select is(
  (select count(*) from public.event_instances where series_id = '00000000-0000-4000-8000-000000001211' and location_name = 'Pitch 6'),
  2::bigint,
  'all-occurrences recurrence edit changes every materialised instance'
);
select is(
  (select count(*) from public.event_change_summaries where edit_scope = 'all'),
  1::bigint,
  'all-occurrences recurrence edit records an auditable summary'
);
reset role;
rollback to savepoint edit_all;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000202', true);
select throws_ok(
  $$select public.edit_recurring_event(
    '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001211',
    '2026-08-02T08:30:00Z', 'this', '{"title":"Unrenderable override"}'::jsonb
  )$$,
  'P0001', 'Title changes apply to the whole recurring series',
  'scoped title edits are rejected instead of silently disappearing'
);
reset role;

savepoint late_availability;
update public.event_instances
set response_deadline = now() - interval '1 minute'
where id = '00000000-0000-4000-8000-000000001202';
delete from public.availability_responses
where id = '00000000-0000-4000-8000-000000001221';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000201', true);
select throws_ok(
  $$insert into public.availability_responses (
    organisation_id, event_instance_id, team_id, player_id, guardian_id, status, idempotency_key
  ) values (
    '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001202',
    '00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000601',
    '00000000-0000-4000-8000-000000000401', 'available', 'late-response-01'
  )$$,
  '42501', null,
  'availability cannot be submitted after the deadline'
);
reset role;
rollback to savepoint late_availability;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000201', true);
select throws_ok(
  $$update public.availability_responses
    set guardian_id = '00000000-0000-4000-8000-000000000403'
    where id = '00000000-0000-4000-8000-000000001221'$$,
  '23503', null,
  'guardian identity cannot be reassigned through availability updates'
);
reset role;

insert into public.poll_respondents (
  id, organisation_id, poll_id, team_id, player_id
) values (
  '00000000-0000-4000-8000-000000001321', '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000001301', '00000000-0000-4000-8000-000000000802',
  '00000000-0000-4000-8000-000000000601'
);
savepoint closed_poll;
update public.polls set status = 'closed' where id = '00000000-0000-4000-8000-000000001301';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000201', true);
select throws_ok(
  $$insert into public.poll_responses (
    organisation_id, poll_id, option_id, respondent_id, response
  ) values (
    '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001301',
    '00000000-0000-4000-8000-000000001311', '00000000-0000-4000-8000-000000001321',
    'available'
  )$$,
  '42501', null,
  'closed poll responses are denied'
);
reset role;
rollback to savepoint closed_poll;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000201', true);
select throws_ok(
  $$select public.convert_poll_to_event_series(
    '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001301',
    '00000000-0000-4000-8000-000000001311', 'parent-denied-conversion'
  )$$,
  '42501', null,
  'poll conversion is denied without manager capability'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000202', true);
select lives_ok(
  $$select public.convert_poll_to_event_series(
    '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001301',
    '00000000-0000-4000-8000-000000001311', 'coach-conversion-01'
  )$$,
  'authorised poll conversion succeeds'
);
select is(
  (select status::text from public.polls where id = '00000000-0000-4000-8000-000000001301'),
  'converted',
  'poll conversion status is durable'
);
select is(
  public.convert_poll_to_event_series(
    '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001301',
    '00000000-0000-4000-8000-000000001311', 'coach-conversion-01'
  ),
  (select converted_series_id from public.polls where id = '00000000-0000-4000-8000-000000001301'),
  'authorised poll conversion replay returns the original UUID'
);
reset role;

savepoint suspended_calendar;
update public.organisations set status = 'suspended' where id = '00000000-0000-4000-8000-000000000101';
select is(
  (select count(*) from public.private_calendar_events(repeat('b', 64))),
  0::bigint,
  'suspended organisation calendar feed is denied'
);
rollback to savepoint suspended_calendar;

update public.standby_replacements
set status = 'offered',
    offered_at = now(),
    expires_at = now() + interval '1 day',
    responded_at = null
where id = '00000000-0000-4000-8000-000000001421';
update public.squad_members
set status = 'standby'
where id = '00000000-0000-4000-8000-000000001403';

savepoint standby_inactive;
update public.guardians
set status = 'inactive'
where id = '00000000-0000-4000-8000-000000000403';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000202', true);
select throws_ok(
  $$select public.accept_standby_replacement('00000000-0000-4000-8000-000000001421')$$,
  '42501', null,
  'inactive guardian cannot accept a standby offer'
);
reset role;
rollback to savepoint standby_inactive;

savepoint standby_acceptance;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000202', true);
select lives_ok(
  $$select public.accept_standby_replacement('00000000-0000-4000-8000-000000001421')$$,
  'linked guardian can atomically accept an unexpired standby offer'
);
select is(
  (select status from public.standby_replacements where id = '00000000-0000-4000-8000-000000001421'),
  'accepted',
  'standby offer is marked accepted'
);
select is(
  (select status::text from public.squad_members where id = '00000000-0000-4000-8000-000000001403'),
  'selected',
  'standby player is selected atomically'
);
select is(
  (select count(*) from public.squad_history where squad_id = '00000000-0000-4000-8000-000000001401'),
  4::bigint,
  'standby acceptance appends immutable squad history'
);
reset role;
rollback to savepoint standby_acceptance;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000202', true);
select throws_ok(
  $$update public.squad_members set status = 'selected' where id = '00000000-0000-4000-8000-000000001403'$$,
  '42501', null,
  'direct squad member status updates are denied'
);
select throws_ok(
  $$update public.standby_replacements set status = 'accepted' where id = '00000000-0000-4000-8000-000000001421'$$,
  '42501', null,
  'direct standby status updates are denied'
);
reset role;

select * from finish();
rollback;
