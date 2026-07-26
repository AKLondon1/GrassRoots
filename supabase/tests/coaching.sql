begin;

select plan(107);

select has_table('public', 'training_sessions', 'training sessions table exists');
select has_table('public', 'drills', 'drill library exists');
select has_table('public', 'session_drills', 'ordered session drills exist');
select has_table('public', 'training_attendance', 'offline-safe attendance exists');
select has_table('public', 'coach_observations', 'private coach observations exist');
select has_table('public', 'development_objectives', 'development objectives exist');
select has_table('public', 'development_reviews', 'private development reviews exist');
select has_table('public', 'parent_development_summaries', 'approved parent summaries are separate');
select has_table('public', 'matches', 'match state exists');
select has_table('public', 'match_events', 'match timeline exists');
select has_table('public', 'match_position_intervals', 'position intervals exist');
select has_table('public', 'playing_time_records', 'derived playing-time records exist');

select has_function('public', 'record_training_attendance', array['uuid','uuid','attendance_mark','timestamp with time zone','text'], 'attendance sync RPC exists');
select has_function('public', 'transition_match_state', array['uuid','match_state','timestamp with time zone'], 'atomic match transition RPC exists');
select has_function('public', 'record_match_substitution', array['uuid','uuid','uuid','text','timestamp with time zone'], 'atomic substitution RPC exists');
select has_function('public', 'log_coach_observation_access', array['uuid','text'], 'audited observation read RPC exists');
select has_function('public', 'record_match_event', array['uuid','text','uuid','timestamp with time zone','jsonb'], 'match timeline event RPC exists');
select has_function('public', 'get_coaching_ai_safe_context', array['uuid','uuid','uuid'], 'AI context is sourced from canonical safe columns');
select has_function('public', 'record_coaching_ai_run', array['uuid','uuid','uuid','text','text','text','text','text','text','integer','integer','numeric'], 'service-only AI metadata audit RPC exists');
select has_function('public', 'save_match_formation', array['uuid','text','jsonb'], 'atomic formation RPC exists');
select has_function('public', 'rotate_match_positions', array['uuid','uuid','uuid'], 'position rotation RPC exists');
select has_function('public', 'correct_match_event', array['uuid','text','jsonb'], 'append-only correction RPC exists');
select has_function('public', 'save_match_reflection_and_summary', array['uuid','text','text'], 'post-match reflection RPC exists');
select has_function('public', 'create_coaching_drill', array['uuid','text','text','text','smallint','smallint','smallint','smallint','smallint','text[]','text','text','text','text','text'], 'full drill RPC exists');
select has_function('public', 'save_training_plan', array['uuid','text','smallint','jsonb'], 'training plan creation RPC exists');
select has_function('public', 'replace_training_plan', array['uuid','text','smallint','jsonb'], 'training plan replacement RPC exists');
select has_function('public', 'move_training_plan_item', array['uuid','uuid','text','text'], 'training plan reorder RPC exists');
select has_function('public', 'create_training_template_from_session', array['uuid','text'], 'training template RPC exists');
select has_function('public', 'record_coach_observation', array['uuid','uuid','text','text','text','text','text','text','text','text','text','text','date'], 'structured observation write RPC exists');
select has_function('public', 'list_coach_observations', array['uuid','text'], 'audited observation list RPC exists');
select has_function('public', 'create_development_objective', array['uuid','uuid','text','date'], 'objective creation RPC exists');
select has_function('public', 'create_development_review', array['uuid','uuid','text'], 'review creation RPC exists');
select has_function('public', 'approve_development_summary', array['uuid','text','text[]','text[]','text','text'], 'structured summary approval RPC exists');
select has_function('public', 'record_training_guest_attendance', array['uuid','text','attendance_mark','timestamp with time zone','text'], 'temporary attendee RPC exists');
select has_function('public', 'record_playing_time_correction', array['uuid','uuid','numeric','text'], 'audited playing-time correction RPC exists');
select has_function('public', 'create_match_day', array['uuid','smallint'], 'canonical match-day creation RPC exists');
select has_function('public', 'is_match_participant', array['uuid','uuid'], 'published squad participant boundary exists');

select ok(not has_table_privilege('authenticated', 'public.matches', 'UPDATE'), 'match state cannot be updated directly');
select ok(not has_table_privilege('authenticated', 'public.matches', 'INSERT'), 'match creation cannot bypass the canonical event RPC');
select ok(not has_table_privilege('authenticated', 'public.match_events', 'INSERT'), 'match events are RPC-only');
select ok(not has_table_privilege('authenticated', 'public.match_position_intervals', 'INSERT'), 'position intervals are RPC-only');
select ok(not has_table_privilege('authenticated', 'public.coach_observations', 'SELECT'), 'private observations require audited RPC access');
select ok(not has_table_privilege('authenticated', 'public.coach_observations', 'UPDATE'), 'observation attribution cannot be reassigned directly');
select ok(not has_table_privilege('authenticated', 'public.coaching_ai_runs', 'INSERT'), 'AI audit rows are RPC-only');
select ok(not has_table_privilege('authenticated', 'public.training_sessions', 'UPDATE'), 'planned duration cannot bypass atomic plan RPCs');

select ok(exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id and r.organisation_id = rp.organisation_id join public.permissions p on p.id = rp.permission_id where r.key = 'coach' and p.key = 'development:manage'), 'coaches receive development management');
select ok(exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id and r.organisation_id = rp.organisation_id join public.permissions p on p.id = rp.permission_id where r.key = 'coach' and p.key = 'training:manage'), 'coaches receive training management');
select ok(exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id and r.organisation_id = rp.organisation_id join public.permissions p on p.id = rp.permission_id where r.key = 'coach' and p.key = 'matches:manage'), 'coaches receive match management');
select ok(exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id and r.organisation_id = rp.organisation_id join public.permissions p on p.id = rp.permission_id where r.key = 'guardian' and p.key = 'development:view-approved'), 'guardians receive approved-summary capability');

select is((select count(*) from public.training_sessions where id = '00000000-0000-4000-8000-000000003001'), 1::bigint, 'fictional training seed exists');
select is((select count(*) from public.matches where id = '00000000-0000-4000-8000-000000003101'), 1::bigint, 'fictional match seed exists');
select is((select side_size from public.matches where id = '00000000-0000-4000-8000-000000003101'), 7::smallint, 'fictional match is configured as seven-a-side');
select is((select count(*) from public.parent_development_summaries where id = '00000000-0000-4000-8000-000000003072'), 1::bigint, 'approved positive summary seed exists');

insert into public.events (id,organisation_id,team_id,kind,title,created_by_membership_id) values ('00000000-0000-4000-8000-000000003900','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000802','training','pgTAP metadata session','00000000-0000-4000-8000-000000000302');
insert into public.event_instances (id,organisation_id,event_id,team_id,starts_at,ends_at) values ('00000000-0000-4000-8000-000000003901','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000003900','00000000-0000-4000-8000-000000000802',clock_timestamp()+interval '1 day',clock_timestamp()+interval '1 day 1 hour');
insert into public.events (id,organisation_id,team_id,kind,title,created_by_membership_id) values ('00000000-0000-4000-8000-000000003902','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000802','match','pgTAP five-a-side match','00000000-0000-4000-8000-000000000302');
insert into public.event_instances (id,organisation_id,event_id,team_id,starts_at,ends_at) values ('00000000-0000-4000-8000-000000003903','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000003902','00000000-0000-4000-8000-000000000802',clock_timestamp()+interval '2 days',clock_timestamp()+interval '2 days 1 hour');
insert into public.event_instances (id,organisation_id,event_id,team_id,starts_at,ends_at,status) values ('00000000-0000-4000-8000-000000003904','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000003902','00000000-0000-4000-8000-000000000802',clock_timestamp()-interval '2 days',clock_timestamp()-interval '2 days'+interval '1 hour','completed');
update public.matches set elapsed_before_ms = 3600000 where id = '00000000-0000-4000-8000-000000003101';

savepoint coach_flow;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000202', true);

select lives_ok($$select public.create_match_day('00000000-0000-4000-8000-000000003903',5::smallint)$$,'coach can create match day from a canonical event with an explicit format');
select is((select side_size from public.matches where event_instance_id='00000000-0000-4000-8000-000000003903'),5::smallint,'match creation preserves the selected five-a-side format');
select throws_ok($$select public.create_match_day('00000000-0000-4000-8000-000000003904',5::smallint)$$,'P0001',null,'completed events cannot create a new match day');
select is(public.is_match_participant('00000000-0000-4000-8000-000000003101','00000000-0000-4000-8000-000000000601'),true,'published selected squad member is a match participant');

select lives_ok(
  $$select public.record_training_attendance('00000000-0000-4000-8000-000000003001', '00000000-0000-4000-8000-000000000603', 'late', clock_timestamp(), 'coaching-pgtap-attendance-rowan')$$,
  'coach can sync a newer attendance action'
);
select is((select status::text from public.training_attendance where training_session_id = '00000000-0000-4000-8000-000000003001' and player_id = '00000000-0000-4000-8000-000000000603'), 'late', 'latest attendance status wins');
select throws_ok(
  $$select public.record_training_attendance('00000000-0000-4000-8000-000000003001', '00000000-0000-4000-8000-000000000602', 'present', clock_timestamp(), 'cross-team-attendance-maya')$$,
  '23503', null, 'attendance rejects a player from another team'
);
select lives_ok($$select public.record_training_guest_attendance('00000000-0000-4000-8000-000000003001','Trialist A','trialist',clock_timestamp(),'coaching-pgtap-trialist-a')$$, 'coach can sync a temporary attendee');
select lives_ok($$select public.save_training_plan('00000000-0000-4000-8000-000000003901','Metadata complete plan',60::smallint,'[{"kind":"drill","drillId":"00000000-0000-4000-8000-000000003012","durationMinutes":30,"participantFocus":"Pairs","equipment":["balls"],"area":"20x15","setup":"Passing gates","diagramUrl":"https://example.test/gates.svg","instructions":"Pass through each gate","coachingPoints":"Scan","progression":"One touch","regression":"Wider gates","safety":"Spacing","inclusion":"Choice","goalkeeper":"Distribution","notes":"Review"}]'::jsonb)$$,'create-plan RPC persists a full drill item');
select is((select instructions from public.session_drills where training_session_id=(select id from public.training_sessions where event_instance_id='00000000-0000-4000-8000-000000003901')),'Pass through each gate','create path preserves drill instructions');
select throws_ok($$select public.record_training_guest_attendance('00000000-0000-4000-8000-000000003001','Trialist B','expected',clock_timestamp(),'coaching-pgtap-invalid-guest')$$,'P0001',null,'guest attendance rejects an invalid registered-player status');
select lives_ok($$select public.create_development_objective('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000603','Receive on the back foot',current_date + 30)$$, 'coach can create a scoped objective');
select lives_ok($$select public.create_development_review('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000603','Positive private review for deliberate sharing.')$$, 'coach can create a private review');
select lives_ok($$select public.record_coach_observation('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000603','Received positively under pressure','Small-sided game','Early scanning','Back-foot receiving','Try both sides','Confident and engaged','CM','Repeat next session','Scanning','private',current_date+7)$$,'coach can record every structured observation field');
select lives_ok($$select public.record_coach_observation('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000603','Shared staff observation','Match','Supporting teammates','','','Engaged','CM','Review together','Communication','coaching-staff',current_date+7)$$,'coach can record a staff-shared observation');
select lives_ok($$select public.create_coaching_drill('00000000-0000-4000-8000-000000000101','Coach private drill','Own private objective','Own private instructions',10::smallint,2::smallint,10::smallint,8::smallint,11::smallint,'{}'::text[],'10x10','adaptable','','','private')$$,'coach can create an owned private drill');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000203',true);
select is(public.can_use_coaching_drill('00000000-0000-4000-8000-000000000101',(select id from public.drills where title='Coach private drill')),false,'a different privileged member cannot use another coach private drill');
select is((select count(*) from public.list_coach_observations('00000000-0000-4000-8000-000000000802','Checking shared staff observations') where observation='Received positively under pressure'),0::bigint,'a different coach cannot list an author-only observation');
select throws_ok($$select * from public.log_coach_observation_access('00000000-0000-4000-8000-000000003051','Attempting a direct private read')$$,'P0001',null,'a different coach cannot directly read an author-only observation');
select is((select count(*) from public.list_coach_observations('00000000-0000-4000-8000-000000000802','Checking shared staff observations') where observation='Shared staff observation'),1::bigint,'a different coach can read a coaching-staff observation');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000202',true);
select lives_ok($$select * from public.list_coach_observations('00000000-0000-4000-8000-000000000802','Reviewing recent positive observations')$$, 'coach can list observations through audited access');
select lives_ok($$select public.replace_training_plan('00000000-0000-4000-8000-000000003001','Updated complete plan',60::smallint,'[{"kind":"segment","title":"Welcome and movement","durationMinutes":15,"participantFocus":"Whole group","equipment":[],"area":"Half pitch","setup":"Cones ready","instructions":"Welcome, move and scan","coachingPoints":"Heads up","progression":"Add a ball","regression":"Reduce area","safety":"Check surface","inclusion":"Vary distance","goalkeeper":"Footwork focus","notes":"Review"},{"kind":"drill","drillId":"00000000-0000-4000-8000-000000003012","durationMinutes":30,"participantFocus":"Pairs","equipment":["balls","cones"],"area":"20x15","setup":"Passing gates","instructions":"","coachingPoints":"Scan","progression":"One touch","regression":"Wider gates","safety":"Spacing","inclusion":"Choice of distance","goalkeeper":"Distribution","notes":""}]'::jsonb)$$, 'coach can replace a full multi-item training plan');
select is((select instructions from public.training_segments where training_session_id='00000000-0000-4000-8000-000000003001' limit 1),'Welcome, move and scan','create/edit path persists full session instructions');
select lives_ok($$select public.move_training_plan_item('00000000-0000-4000-8000-000000003001',(select id from public.session_drills where training_session_id='00000000-0000-4000-8000-000000003001' limit 1),'drill','up')$$, 'coach can reorder a training plan');
select lives_ok($$select public.create_training_template_from_session('00000000-0000-4000-8000-000000003001','Reusable pgTAP session')$$, 'coach can create a template from a session');

insert into public.development_reviews (id, organisation_id, team_id, player_id, status, private_review, reviewed_by_membership_id, reviewed_at)
values ('00000000-0000-4000-8000-000000003079', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000603', 'draft', 'Draft review that must remain private.', '00000000-0000-4000-8000-000000000302', '2026-08-10T10:00:00Z');
select throws_ok(
  $$insert into public.parent_development_summaries (organisation_id, team_id, player_id, review_id, summary, approved_by_membership_id, approved_at) values ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000603','00000000-0000-4000-8000-000000003079','This draft must not be shared.','00000000-0000-4000-8000-000000000302','2026-08-10T10:01:00Z')$$,
  '42501', null, 'draft reviews cannot create parent-visible summaries'
);

select lives_ok(
  $$select public.transition_match_state('00000000-0000-4000-8000-000000003101', 'running', '2026-08-09T09:00:00Z')$$,
  'coach can atomically start a ready match'
);
select is((select count(*) from public.match_periods where match_id = '00000000-0000-4000-8000-000000003101' and ended_at is null), 1::bigint, 'starting creates the first match period');
select is((select count(*) from public.match_position_intervals where match_id = '00000000-0000-4000-8000-000000003101' and left_at is null), 7::bigint, 'starting creates all initial formation intervals');
select throws_ok(
  $$select public.transition_match_state('00000000-0000-4000-8000-000000003101', 'ready', '2026-08-09T09:01:00Z')$$,
  'P0001', null, 'running matches cannot transition back to ready'
);
select throws_ok(
  $$select public.record_match_substitution('00000000-0000-4000-8000-000000003101', '00000000-0000-4000-8000-000000000604', '00000000-0000-4000-8000-000000000609', 'GK', '2026-08-09T09:15:00Z')$$,
  'P0001', null, 'substitution cannot introduce a second goalkeeper'
);
select lives_ok(
  $$select public.record_match_event('00000000-0000-4000-8000-000000003101', 'goal', '00000000-0000-4000-8000-000000000603', '2026-08-09T09:20:00Z', '{"for":"Riverside"}'::jsonb)$$,
  'coach can record a validated goal event'
);
select lives_ok($$select public.rotate_match_positions('00000000-0000-4000-8000-000000003101','00000000-0000-4000-8000-000000000604','00000000-0000-4000-8000-000000000605')$$, 'coach can rotate two on-pitch positions atomically');
select lives_ok($$select public.correct_match_event((select id from public.match_events where match_id='00000000-0000-4000-8000-000000003101' and event_type='goal' order by occurred_at desc limit 1),'Wrong player selected','{"player":"corrected"}'::jsonb)$$, 'coach can append an audited event correction');

select lives_ok(
  $$select public.record_match_substitution('00000000-0000-4000-8000-000000003101', '00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000609', 'GK', '2026-08-09T09:30:00Z')$$,
  'coach substitution closes and opens position intervals atomically'
);
select is((select count(*) from public.match_position_intervals where match_id = '00000000-0000-4000-8000-000000003101' and player_id = '00000000-0000-4000-8000-000000000601' and left_at is not null), 1::bigint, 'outgoing interval is closed using the server clock');
select lives_ok(
  $$select public.transition_match_state('00000000-0000-4000-8000-000000003101', 'paused', '2026-08-09T09:40:00Z')$$,
  'pausing closes the current period and pitch intervals'
);
select lives_ok(
  $$select public.transition_match_state('00000000-0000-4000-8000-000000003101', 'running', '2026-08-09T09:45:00Z')$$,
  'resuming creates a new period and restores only the paused lineup'
);
select is((select count(*) from public.match_position_intervals where match_id = '00000000-0000-4000-8000-000000003101' and left_at is null), 7::bigint, 'resume restores exactly the seven-player paused lineup');
select lives_ok(
  $$select public.transition_match_state('00000000-0000-4000-8000-000000003101', 'completed', '2026-08-09T10:00:00Z')$$,
  'completing the match closes intervals and calculates playing time'
);
select ok((select count(*) from public.playing_time_records where match_id = '00000000-0000-4000-8000-000000003101') >= 7, 'completion persists per-player playing time');
select is((select count(*) from public.playing_time_records where match_id='00000000-0000-4000-8000-000000003101'),(select count(*) from public.squad_members where squad_id='00000000-0000-4000-8000-000000001401' and status='selected'),'completion persists fairness rows for the full selected squad');
select is((select starter_minutes from public.playing_time_records where match_id='00000000-0000-4000-8000-000000003101' and player_id='00000000-0000-4000-8000-000000000609'),0::numeric,'a substitute receives zero starter minutes');
select is((select starter_minutes from public.playing_time_records where match_id='00000000-0000-4000-8000-000000003101' and player_id='00000000-0000-4000-8000-000000000604'),(select total_minutes from public.playing_time_records where match_id='00000000-0000-4000-8000-000000003101' and player_id='00000000-0000-4000-8000-000000000604'),'a starter total includes play after a pause and resume');
select lives_ok($$select public.save_match_reflection_and_summary('00000000-0000-4000-8000-000000003101','Private reflection for next training.','The team supported each other and made brave choices.')$$, 'coach can save a private reflection and approved parent update');
select lives_ok($$select public.record_playing_time_correction('00000000-0000-4000-8000-000000003101','00000000-0000-4000-8000-000000000601',1.5,'Verified against the coach match sheet')$$,'coach can append an audited playing-time correction');
select throws_ok($$select public.record_playing_time_correction('00000000-0000-4000-8000-000000003101','00000000-0000-4000-8000-000000000601',-240,'Invalid negative effective total')$$,'P0001',null,'playing-time corrections cannot make the effective total negative');
select throws_ok($$select public.save_match_formation('00000000-0000-4000-8000-000000003101','Too late','[]'::jsonb)$$,'P0001',null,'formations cannot be changed after match start');
select lives_ok($$select public.approve_development_summary('00000000-0000-4000-8000-000000003079','A positive reviewed update for the family.')$$, 'coach can approve and publish a separate development summary');

select lives_ok(
  $$select * from public.log_coach_observation_access('00000000-0000-4000-8000-000000003051', 'Preparing the scheduled development review')$$,
  'authorised observation read succeeds with a reason'
);
reset role;
select is((select count(*) from public.audit_log where resource_id = '00000000-0000-4000-8000-000000003051' and action = 'coach-observation.read'), 2::bigint, 'each private observation access is audited');
rollback to savepoint coach_flow;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000201', true);
select is((select count(*) from public.parent_development_summaries where player_id = '00000000-0000-4000-8000-000000000601'), 1::bigint, 'linked guardian sees an approved summary');
select throws_ok($$select public.create_coaching_drill('00000000-0000-4000-8000-000000000101','Private attempt','No access','No access',10::smallint,2::smallint,10::smallint,8::smallint,11::smallint,'{}'::text[],'10x10','adaptable','','','private')$$,'P0001',null,'guardian cannot create private drills');
select throws_ok($$select public.record_coaching_ai_run('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000802','development-summary-draft','gpt','v1','v1','hash','ready',null,null,null)$$,'42501',null,'authenticated clients cannot fabricate AI audit rows');
reset role;

select * from finish();
rollback;
