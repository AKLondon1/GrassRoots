begin;

select plan(70);

select has_table('public','announcements','announcements exist');
select has_table('public','conversation_messages','adult group messages exist');
select has_table('public','member_invoices','club member invoices exist');
select has_table('public','member_transactions','member transactions exist');
select has_table('public','platform_subscriptions','platform subscriptions are separate');
select has_table('public','consent_responses','versioned consent responses exist');
select has_table('public','player_medical_profiles','medical records are separate');
select has_table('public','safeguarding_concerns','restricted safeguarding concerns exist');
select has_table('public','sensitive_access_log','sensitive metadata audit exists');
select has_table('public','workforce_qualifications','qualification expiry records exist');
select has_table('public','organisation_lifecycle','organisation lifecycle exists');
select has_table('public','background_jobs','retention and deletion jobs exist');

select has_function('public','process_stripe_webhook_event',array['text','text','uuid','text','uuid','bigint','text'],'idempotent Stripe transition RPC exists');
select has_function('public','record_manual_member_payment',array['uuid','uuid','bigint','text'],'manual payment transition RPC exists');
select has_function('public','request_member_refund',array['uuid','uuid','bigint','text'],'bounded refund RPC exists');
select has_function('public','create_member_invoice',array['uuid','text','uuid','uuid','uuid','text','bigint','date'],'atomic member invoice RPC exists');
select has_function('public','record_cash_reconciliation',array['uuid','bigint','bigint','text'],'cash reconciliation RPC exists');
select has_function('public','create_adult_conversation',array['uuid','text','uuid'],'atomic adult conversation RPC exists');
select has_function('public','publish_announcement',array['uuid','text','text','uuid'],'actor-bound announcement publish RPC exists');
select has_function('public','list_open_conversation_reports',array['uuid'],'guarded moderation read RPC exists');
select has_function('public','resolve_conversation_report',array['uuid','uuid','text','text','text'],'atomic moderation outcome RPC exists');
select has_function('public','is_team_audience',array['uuid','uuid'],'team announcement audience guard exists');
select has_function('public','respond_to_consent',array['uuid','uuid','uuid','text'],'guardian consent RPC exists');
select has_function('public','create_consent_definition',array['uuid','text','text','text','text'],'actor-bound consent definition RPC exists');
select has_function('public','publish_consent_version',array['uuid','uuid','text'],'locked sequential consent publication RPC exists');
select has_function('public','list_current_guardian_consent_requests',array['uuid'],'guardian current-consent request RPC exists');
select has_function('public','read_emergency_player_profile',array['uuid','uuid','text'],'minimal emergency read RPC exists');
select has_function('public','read_safeguarding_concern',array['uuid','uuid','text'],'audited welfare read RPC exists');
select has_function('public','list_safeguarding_concern_metadata',array['uuid','text'],'audited welfare metadata list RPC exists');
select has_function('public','upsert_player_medical_profile',array['uuid','uuid','text','text'],'restricted medical write RPC exists');
select has_function('public','record_safeguarding_action',array['uuid','uuid','text','text','text'],'restricted welfare action RPC exists');
select has_function('public','transfer_organisation_ownership',array['uuid','uuid'],'ownership transfer RPC exists');
select has_function('public','schedule_organisation_deletion',array['uuid'],'delayed organisation deletion RPC exists');
select has_function('public','cancel_organisation_deletion',array['uuid'],'organisation deletion recovery RPC exists');
select has_function('public','request_account_export',array['uuid'],'account export queue RPC exists');
select has_function('public','schedule_account_deletion',array[]::text[],'delayed account deletion RPC exists');
select has_function('public','enqueue_due_retention_jobs',array[]::text[],'scheduled retention enqueue RPC exists');
select has_function('public','run_retention_sweep',array['uuid'],'policy-driven retention worker RPC exists');
select has_function('public','prepare_account_erasure',array['uuid'],'account erasure preserves historical actor keys exists');

select ok(not has_table_privilege('authenticated','public.player_medical_profiles','SELECT'),'medical bodies are not directly selectable');
select ok(not has_table_privilege('authenticated','public.safeguarding_concerns','SELECT'),'safeguarding bodies are not directly selectable');
select ok(not has_table_privilege('authenticated','public.stripe_webhook_events','SELECT'),'webhook metadata is service-only');
select ok(exists (select 1 from public.roles where key='treasurer'),'treasurer role is seeded');
select ok(exists (select 1 from public.roles where key='welfare-officer'),'welfare role is seeded');
select ok(exists (select 1 from public.roles where key='owner'),'owner role is seeded');
select is((select count(*) from public.member_invoices where invoice_number='GR-2026-014'),1::bigint,'fictional member invoice is seeded');
select is((select count(*) from public.platform_subscriptions where organisation_id='00000000-0000-4000-8000-000000000101'),1::bigint,'separate platform subscription is seeded');
select is((select count(*) from public.safeguarding_concerns where id='00000000-0000-4000-8000-000000004220'),1::bigint,'fictional restricted workflow seed exists');
select is((select discount_pence from public.member_invoices where id='00000000-0000-4000-8000-000000004101'),2500::bigint,'seed discount is applied after the invoice line total exists');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000201',true);
select lives_ok($$select public.respond_to_consent('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000004201','00000000-0000-4000-8000-000000000601','granted')$$,'linked guardian can answer the current version');
select is((select count(*) from public.consent_responses where player_id='00000000-0000-4000-8000-000000000601' and decision='granted'),1::bigint,'consent response retains player, guardian and exact version');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000202',true);
select is((select count(*) from public.read_emergency_player_profile('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000601','coach.emergency.denied')),0::bigint,'ordinary coach receives no medical body');
reset role;
select is((select count(*) from public.sensitive_access_log where resource_id='00000000-0000-4000-8000-000000000601' and outcome='denied'),1::bigint,'denied medical read is logged as metadata');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000203',true);
select lives_ok($$select * from public.read_safeguarding_concern('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000004220','welfare.case.review')$$,'welfare officer can use the audited restricted read');
reset role;
select is((select count(*) from public.sensitive_access_log where resource_id='00000000-0000-4000-8000-000000004220' and outcome='allowed'),1::bigint,'allowed safeguarding read is logged without case body');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000203',true);
select lives_ok($$select public.record_manual_member_payment('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000004101',4500,'pgtap-bank-reference')$$,'treasurer can record an explicit manual payment');
select is((select count(*) from public.member_transactions where provider_reference='pgtap-bank-reference' and status='settled'),1::bigint,'manual payment creates exactly one settled transaction');
reset role;
delete from public.member_transactions where provider_reference='pgtap-bank-reference';
update public.member_invoices set status='issued', paid_at=null where id='00000000-0000-4000-8000-000000004101';

select is(public.process_stripe_webhook_event('evt_pgtap_1','unhandled.fixture','00000000-0000-4000-8000-000000000101',repeat('a',64),null,null,'gbp'),true,'first verified webhook metadata is accepted');
select is(public.process_stripe_webhook_event('evt_pgtap_1','unhandled.fixture','00000000-0000-4000-8000-000000000101',repeat('a',64),null,null,'gbp'),false,'duplicate webhook id is ignored');
select is(public.process_stripe_webhook_event('evt_pgtap_retry','payment_intent.succeeded','00000000-0000-4000-8000-000000000101',repeat('b',64),'00000000-0000-4000-8000-000000004101',0,'gbp'),false,'failed webhook settlement returns unprocessed without rolling back its receipt');
select is((select processing_status from public.stripe_webhook_events where stripe_event_id='evt_pgtap_retry'),'failed','failed webhook status remains durable for an observable retry');
select is(public.process_stripe_webhook_event('evt_pgtap_retry','payment_intent.succeeded','00000000-0000-4000-8000-000000000101',repeat('b',64),'00000000-0000-4000-8000-000000004101',12500,'gbp'),true,'a failed webhook receipt can be retried idempotently after corrected settlement extraction');

insert into public.background_jobs (id,kind,idempotency_key,status,leased_at,available_at) values ('00000000-0000-4000-8000-000000004299','retention','pgtap-stale-lease','leased',now()-interval '20 minutes',now()-interval '20 minutes');
select is((select count(*) from public.lease_background_jobs(100) where id='00000000-0000-4000-8000-000000004299'),1::bigint,'stale worker leases are reclaimed atomically');

update public.organisation_lifecycle set deletion_status='retention-hold',delete_after=now()+interval '90 days' where organisation_id='00000000-0000-4000-8000-000000000101';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000203',true);
select throws_ok($$select public.schedule_organisation_deletion('00000000-0000-4000-8000-000000000101')$$,'55000',null,'organisation retention hold cannot be overwritten by rescheduling');
reset role;
select is((select deletion_status from public.organisation_lifecycle where organisation_id='00000000-0000-4000-8000-000000000101'),'retention-hold','organisation retention hold remains intact');
insert into public.account_deletion_requests (user_id,status,delete_after,legal_hold_until,legal_hold_reason,reviewed_by_membership_id)
values ('00000000-0000-4000-8000-000000000202','retention-hold',now()+interval '90 days',now()+interval '90 days','Fictional pgTAP reviewed safeguarding hold','00000000-0000-4000-8000-000000000303')
on conflict (user_id) do update set status='retention-hold',delete_after=excluded.delete_after,legal_hold_until=excluded.legal_hold_until,legal_hold_reason=excluded.legal_hold_reason,reviewed_by_membership_id=excluded.reviewed_by_membership_id;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000202',true);
select throws_ok($$select public.schedule_account_deletion()$$,'55000',null,'account retention hold cannot be overwritten by rescheduling');
reset role;
select is((select status from public.account_deletion_requests where user_id='00000000-0000-4000-8000-000000000202'),'retention-hold','account retention hold remains intact');

insert into public.data_export_requests (organisation_id,requested_by_membership_id,subject_user_id,scope) values ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302','00000000-0000-4000-8000-000000000202','account');
select lives_ok($$select public.prepare_account_erasure('00000000-0000-4000-8000-000000000202')$$,'account erasure works with authored records and a prerequisite export request');
select is((select user_id from public.memberships where id='00000000-0000-4000-8000-000000000302'),null::uuid,'historical membership actor key is tombstoned without deleting the row');
select lives_ok($$delete from auth.users where id='00000000-0000-4000-8000-000000000202'$$,'prepared account can be hard-deleted without historical actor foreign-key failures');

select * from finish();
rollback;
