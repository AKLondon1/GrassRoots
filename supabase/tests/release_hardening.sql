begin;
select plan(38);

select has_table('public','magic_response_tokens','one-time response tokens exist');
select has_table('public','private_upload_intents','private upload quarantine exists');
select has_table('public','data_correction_requests','data corrections are persisted');
select has_table('public','session_revocations','session revocations are persisted');
select has_function('public','consume_magic_response_token',array['text'],'magic token consumption is atomic');
select has_function('public','consume_rate_limit',array['text','integer','integer'],'distributed rate limit RPC exists');
select col_is_unique('public','magic_response_tokens','token_digest','one-time token digests are unique');
select policies_are('public','security_rate_limits',array[]::text[],'rate-limit internals are not directly exposed');
select isnt_empty($$select indexname from pg_indexes where schemaname='public' and indexname='events_bounded_agenda_idx'$$,'agenda query has a bounded index');
select isnt_empty($$select 1 from storage.buckets where id='grassroots-private-quarantine' and public=false$$,'quarantine bucket is private');

select ok(not has_table_privilege('authenticated','public.private_upload_intents','INSERT'),'authenticated users cannot insert upload state directly');
select ok(not has_table_privilege('authenticated','public.private_upload_intents','UPDATE'),'authenticated users cannot update upload state directly');
select ok(has_function_privilege('service_role','public.record_private_upload_scan(uuid,boolean,text)','EXECUTE'),'only the scanner service boundary can record a verdict');
select ok(has_function_privilege('authenticated','public.create_private_upload_intent(uuid,text,text,text,bigint)','EXECUTE'),'document managers can use the scoped upload-intent RPC');
select ok(not has_function_privilege('authenticated','public.consume_magic_response_token(text)','EXECUTE'),'raw token consumption is service-only');
select ok(not has_function_privilege('authenticated','public.consume_rate_limit(text,integer,integer)','EXECUTE'),'rate-limit buckets are server-controlled');

savepoint direct_upload_denied;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000201',true);
select throws_ok($$insert into public.private_upload_intents (organisation_id,actor_membership_id,storage_path,original_filename,declared_mime,declared_size,status,checksum_sha256,scanned_at) values ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000101/quarantine/spoof.pdf','spoof.pdf','application/pdf',10,'clean',repeat('a',64),now())$$,'42501',null,'authenticated user cannot spoof a clean upload');
reset role;
rollback to savepoint direct_upload_denied;

savepoint token_lifecycle;
insert into public.magic_response_tokens (organisation_id,token_digest,purpose,subject_resource_type,subject_resource_id,expires_at,created_at)
values
 ('00000000-0000-4000-8000-000000000101',repeat('a',64),'poll','poll','00000000-0000-4000-8000-000000001301',now()+interval '10 minutes',now()),
 ('00000000-0000-4000-8000-000000000101',repeat('b',64),'poll','poll','00000000-0000-4000-8000-000000001301',now()-interval '1 minute',now()-interval '1 hour');
select is((select count(*) from public.consume_magic_response_token(repeat('a',64))),1::bigint,'live token is consumed exactly once');
select is((select count(*) from public.consume_magic_response_token(repeat('a',64))),0::bigint,'consumed token cannot be replayed');
select is((select count(*) from public.consume_magic_response_token(repeat('b',64))),0::bigint,'expired token cannot be consumed');
rollback to savepoint token_lifecycle;

savepoint session_isolation;
insert into public.session_revocations (user_id,session_digest,reason_code,expires_at,created_by_user_id)
values ('00000000-0000-4000-8000-000000000201',repeat('c',64),'pgtap.sign-out',now()+interval '1 hour','00000000-0000-4000-8000-000000000201');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000201',true);
select is((select count(*) from public.session_revocations where session_digest=repeat('c',64)),1::bigint,'user can see their own revoked session');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000202',true);
select is((select count(*) from public.session_revocations where session_digest=repeat('c',64)),0::bigint,'another user cannot see a revoked session');
reset role;
rollback to savepoint session_isolation;

savepoint correction_isolation;
insert into public.data_correction_requests (organisation_id,requester_membership_id,subject_user_id,field_key,proposed_value,reason)
values ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000201','display_name','Alex Morgan-Smith','A spelling correction is needed');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000201',true);
select is((select count(*) from public.data_correction_requests where subject_user_id='00000000-0000-4000-8000-000000000201'),1::bigint,'subject can see their correction request');
select is(public.cancel_data_correction((select id from public.data_correction_requests where subject_user_id='00000000-0000-4000-8000-000000000201' limit 1)),true,'subject can cancel a pending correction');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000202',true);
select is((select count(*) from public.data_correction_requests where subject_user_id='00000000-0000-4000-8000-000000000201'),0::bigint,'unprivileged user cannot see another subject correction');
reset role;
rollback to savepoint correction_isolation;

savepoint scanner_transition;
insert into public.private_upload_intents (id,organisation_id,actor_membership_id,storage_path,original_filename,declared_mime,declared_size,status,checksum_sha256,uploaded_at)
values ('00000000-0000-4000-8000-000000009001','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000101/quarantine/pgtap.pdf','pgtap.pdf','application/pdf',10,'quarantined',repeat('d',64),now());
select is(public.record_private_upload_scan('00000000-0000-4000-8000-000000009001',true,'pgtap-scanner-1'),true,'scanner can approve a quarantined object once');
select is((select status from public.private_upload_intents where id='00000000-0000-4000-8000-000000009001'),'clean','clean verdict persists a scanned status');
select is(public.record_private_upload_scan('00000000-0000-4000-8000-000000009001',true,'pgtap-scanner-replay'),false,'scanner verdict cannot be replayed after final state');
rollback to savepoint scanner_transition;

savepoint magic_availability;
insert into public.event_instances (id,organisation_id,event_id,team_id,starts_at,ends_at,response_deadline,location_name,status)
values ('00000000-0000-4000-8000-000000009002','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000001202','00000000-0000-4000-8000-000000000802',now()+interval '2 days',now()+interval '2 days 90 minutes',now()+interval '1 day','Fictional pgTAP pitch','scheduled');
insert into public.magic_response_tokens (organisation_id,token_digest,purpose,subject_resource_type,subject_resource_id,guardian_id,player_id,expires_at)
values ('00000000-0000-4000-8000-000000000101',repeat('f',64),'availability','event-instance','00000000-0000-4000-8000-000000009002','00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000601',now()+interval '1 hour');
select is((select count(*) from public.get_magic_availability_context(repeat('f',64))),1::bigint,'live availability token reveals only its bounded response context');
select is((select count(*) from public.submit_magic_availability_response(repeat('f',64),'available','Fictional pgTAP response',1::smallint)),1::bigint,'availability response and token consumption complete atomically');
select is((select status from public.availability_responses where event_instance_id='00000000-0000-4000-8000-000000009002' and player_id='00000000-0000-4000-8000-000000000601'),'available'::public.availability_status,'magic response persists against the scoped player and event');
select is((select count(*) from public.submit_magic_availability_response(repeat('f',64),'unavailable',null,null)),0::bigint,'availability token cannot be replayed');
rollback to savepoint magic_availability;

savepoint rate_limit;
set local role service_role;
select ok((select allowed from public.consume_rate_limit(repeat('e',64),2,60)),'first distributed rate-limit request is allowed');
select ok((select allowed from public.consume_rate_limit(repeat('e',64),2,60)),'second request within the allowance is allowed');
select ok(not (select allowed from public.consume_rate_limit(repeat('e',64),2,60)),'request over the distributed allowance is denied');
reset role;
rollback to savepoint rate_limit;

select throws_ok($$insert into public.private_upload_intents (organisation_id,actor_membership_id,storage_path,original_filename,declared_mime,declared_size) values ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000999999/quarantine/wrong.pdf','wrong.pdf','application/pdf',10)$$,'23514',null,'cross-tenant upload paths fail the organisation constraint');
select isnt_empty($$select 1 from storage.buckets where id='grassroots-private-files' and public=false$$,'released private file bucket is private');
select has_function('public','decide_data_correction',array['uuid','text','text'],'correction decisions are explicit and audited');

select * from finish();
rollback;
