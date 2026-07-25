-- Versioned consent, restricted medical/welfare records and lifecycle operations.

create table public.consent_definitions (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  key text not null, title text not null, purpose text not null, active boolean not null default true,
  created_by_membership_id uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, organisation_id), unique (organisation_id, key),
  foreign key (created_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict
);

create table public.consent_definition_versions (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  definition_id uuid not null, version integer not null check (version > 0), body text not null,
  published_by_membership_id uuid not null, published_at timestamptz not null default now(), retired_at timestamptz,
  unique (id, organisation_id), unique (organisation_id, definition_id, version),
  foreign key (definition_id, organisation_id) references public.consent_definitions(id, organisation_id) on delete cascade,
  foreign key (published_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict
);

create table public.consent_responses (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  definition_version_id uuid not null, player_id uuid not null, guardian_id uuid not null,
  decision text not null check (decision in ('granted','declined')), responded_at timestamptz not null default now(), withdrawn_at timestamptz,
  withdrawal_reason text, created_at timestamptz not null default now(),
  unique (id, organisation_id), unique (organisation_id, definition_version_id, player_id, guardian_id),
  foreign key (definition_version_id, organisation_id) references public.consent_definition_versions(id, organisation_id) on delete restrict,
  foreign key (player_id, organisation_id) references public.players(id, organisation_id) on delete cascade,
  foreign key (guardian_id, organisation_id) references public.guardians(id, organisation_id) on delete restrict,
  check ((withdrawn_at is null) = (withdrawal_reason is null))
);

create function public.validate_consent_guardian_link()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.player_guardians pg join public.guardian_permissions gp on gp.player_guardian_id = pg.id and gp.organisation_id = pg.organisation_id
    where pg.organisation_id = new.organisation_id and pg.player_id = new.player_id and pg.guardian_id = new.guardian_id and gp.consent
  ) then raise exception 'guardian is not authorised to respond for this player' using errcode = '42501'; end if;
  return new;
end; $$;
create trigger consent_response_guardian before insert or update of player_id,guardian_id on public.consent_responses
for each row execute function public.validate_consent_guardian_link();

create table public.player_emergency_contacts (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  player_id uuid not null, guardian_id uuid not null, contact_name text not null, contact_phone text not null,
  priority integer not null check (priority between 1 and 5), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, organisation_id), unique (organisation_id, player_id, priority),
  foreign key (player_id, organisation_id) references public.players(id, organisation_id) on delete cascade,
  foreign key (guardian_id, organisation_id) references public.guardians(id, organisation_id) on delete restrict
);

create table public.player_medical_profiles (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  player_id uuid not null, emergency_summary text not null default '', clinical_notes text not null default '',
  updated_by_membership_id uuid not null, reviewed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, organisation_id), unique (organisation_id, player_id),
  foreign key (player_id, organisation_id) references public.players(id, organisation_id) on delete cascade,
  foreign key (updated_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict
);
comment on table public.player_medical_profiles is 'Restricted medical data. Never include clinical_notes in notifications, analytics, ordinary audit or exports.';

create function public.validate_emergency_contact_guardian()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.player_guardians pg join public.guardian_permissions gp on gp.player_guardian_id=pg.id and gp.organisation_id=pg.organisation_id and gp.emergency_contact
    where pg.organisation_id=new.organisation_id and pg.player_id=new.player_id and pg.guardian_id=new.guardian_id
  ) then raise exception 'emergency contact guardian is not authorised for this player' using errcode='23514'; end if;
  return new;
end; $$;
create trigger emergency_contact_guardian before insert or update of player_id,guardian_id on public.player_emergency_contacts
for each row execute function public.validate_emergency_contact_guardian();

create table public.safeguarding_concerns (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  raised_by_membership_id uuid not null, assigned_welfare_membership_id uuid, category text not null,
  summary text not null, detail text not null, risk_level text not null check (risk_level in ('low','medium','high','immediate')),
  status text not null default 'open' check (status in ('open','assessing','referred','closed')),
  occurred_at timestamptz, closed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (raised_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  foreign key (assigned_welfare_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  check ((status = 'closed') = (closed_at is not null) or status <> 'closed')
);
comment on table public.safeguarding_concerns is 'Highly restricted. Summary and detail must never be copied into ordinary audit, notification or analytics payloads.';

create table public.safeguarding_actions (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  concern_id uuid not null, actor_membership_id uuid not null, action_type text not null check (action_type in ('note','assign','refer','status-change','close')),
  detail text not null, created_at timestamptz not null default now(), unique (id, organisation_id),
  foreign key (concern_id, organisation_id) references public.safeguarding_concerns(id, organisation_id) on delete cascade,
  foreign key (actor_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict
);

create table public.workforce_checks (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  membership_id uuid not null, check_type text not null, reference_hash text,
  status text not null check (status in ('pending','clear','attention','expired')), checked_on date, expires_on date,
  verified_by_membership_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, organisation_id), unique (organisation_id, membership_id, check_type),
  foreign key (membership_id, organisation_id) references public.memberships(id, organisation_id) on delete cascade,
  foreign key (verified_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  check (expires_on is null or checked_on is null or checked_on <= expires_on)
);

create table public.workforce_qualifications (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  membership_id uuid not null, qualification_type text not null, issuer text not null, reference_hash text,
  awarded_on date not null, expires_on date, verified_by_membership_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, organisation_id), unique (organisation_id, membership_id, qualification_type, awarded_on),
  foreign key (membership_id, organisation_id) references public.memberships(id, organisation_id) on delete cascade,
  foreign key (verified_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  check (expires_on is null or awarded_on <= expires_on)
);

create table public.club_policies (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  key text not null, title text not null, active boolean not null default true, created_at timestamptz not null default now(),
  unique (id, organisation_id), unique (organisation_id, key)
);

create table public.club_policy_versions (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  policy_id uuid not null, version integer not null check (version > 0), storage_path text not null, checksum text not null,
  published_by_membership_id uuid not null, published_at timestamptz not null default now(),
  unique (id, organisation_id), unique (organisation_id, policy_id, version),
  foreign key (policy_id, organisation_id) references public.club_policies(id, organisation_id) on delete cascade,
  foreign key (published_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict
);

create table public.club_policy_acknowledgements (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  policy_version_id uuid not null, membership_id uuid not null, acknowledged_at timestamptz not null default now(),
  unique (id, organisation_id), unique (organisation_id, policy_version_id, membership_id),
  foreign key (policy_version_id, organisation_id) references public.club_policy_versions(id, organisation_id) on delete restrict,
  foreign key (membership_id, organisation_id) references public.memberships(id, organisation_id) on delete cascade
);

create table public.sensitive_access_log (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  actor_membership_id uuid, resource_type text not null check (resource_type in ('medical-profile','emergency-contact','safeguarding-concern','safeguarding-action')),
  resource_id uuid not null, action text not null, outcome text not null check (outcome in ('allowed','denied')),
  reason_code text not null check (reason_code ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  request_id uuid not null default gen_random_uuid(), occurred_at timestamptz not null default now(), unique (id, organisation_id),
  foreign key (actor_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict
);
comment on table public.sensitive_access_log is 'Metadata only. reason_code is structured; body content and clinical or welfare detail are prohibited.';

create function public.audit_log_reject_sensitive_body()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.resource_type in ('medical-profile','emergency-contact','safeguarding-concern','safeguarding-action') then
    if new.reason is not null then
      raise exception 'free-text reasons are prohibited for sensitive resources in ordinary audit' using errcode='23514';
    end if;
    if new.action='safeguarding-concern.raised' then
      if new.metadata - 'risk_level' <> '{}'::jsonb or (new.metadata ? 'risk_level' and jsonb_typeof(new.metadata->'risk_level') <> 'string') then
        raise exception 'only structured risk_level metadata is permitted for this sensitive audit action' using errcode='23514';
      end if;
    elsif new.metadata <> '{}'::jsonb then
      raise exception 'sensitive audit metadata is not allowlisted for this action' using errcode='23514';
    end if;
  end if;
  return new;
end; $$;
create trigger audit_log_reject_sensitive_body before insert or update on public.audit_log
for each row execute function public.audit_log_reject_sensitive_body();

-- Extends 0004 ownership without duplicating equipment_items, volunteer_shifts, support_requests or audit_log.
create table public.equipment_loans (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  equipment_item_id uuid not null, membership_id uuid not null, quantity integer not null check (quantity > 0),
  checked_out_at timestamptz not null default now(), due_at timestamptz, returned_at timestamptz,
  unique (id, organisation_id),
  foreign key (equipment_item_id, organisation_id) references public.equipment_items(id, organisation_id) on delete restrict,
  foreign key (membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  check (returned_at is null or returned_at >= checked_out_at)
);

create table public.operational_tasks (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  title text not null, assigned_membership_id uuid, due_at timestamptz, status text not null default 'open' check (status in ('open','in-progress','complete','cancelled')),
  related_resource_type text, related_resource_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, organisation_id), foreign key (assigned_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete set null (assigned_membership_id)
);

create table public.stored_files (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  storage_path text not null, content_type text not null, byte_size bigint not null check (byte_size between 1 and 52428800), checksum_sha256 text not null,
  classification text not null check (classification in ('ordinary','confidential','medical','safeguarding')),
  uploaded_by_membership_id uuid not null, created_at timestamptz not null default now(), deleted_at timestamptz,
  unique (id, organisation_id), unique (organisation_id, storage_path),
  foreign key (uploaded_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict
);

create table public.data_export_requests (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  requested_by_membership_id uuid not null, subject_user_id uuid, scope text not null check (scope in ('account','organisation','report')),
  status text not null default 'queued' check (status in ('queued','processing','ready','failed','expired')),
  storage_path text, expires_at timestamptz, requested_at timestamptz not null default now(), completed_at timestamptz,
  unique (id, organisation_id), foreign key (requested_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict
);

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'scheduled' check (status in ('scheduled','retention-hold','processing','complete','cancelled')),
  requested_at timestamptz not null default now(), delete_after timestamptz not null default (now() + interval '30 days'), completed_at timestamptz,
  unique (user_id)
);

create table public.organisation_lifecycle (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  owner_membership_id uuid not null, trial_ends_at timestamptz not null default (now() + interval '14 days'),
  founding_entitlement boolean not null default false, deletion_status text not null default 'active' check (deletion_status in ('active','scheduled','retention-hold','processing')),
  delete_after timestamptz, updated_at timestamptz not null default now(),
  foreign key (owner_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  check ((deletion_status = 'active') = (delete_after is null))
);

create table public.ownership_transfers (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  from_membership_id uuid not null, to_membership_id uuid not null, transferred_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (from_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  foreign key (to_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  check (from_membership_id <> to_membership_id)
);

create table public.retention_policies (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  resource_type text not null, retain_days integer not null check (retain_days between 0 and 3650), legal_basis text not null,
  active boolean not null default true, updated_at timestamptz not null default now(), unique (id, organisation_id), unique (organisation_id, resource_type)
);

create table public.background_jobs (
  id uuid primary key default gen_random_uuid(), organisation_id uuid references public.organisations(id) on delete cascade,
  kind text not null check (kind in ('export','account-deletion','organisation-deletion','retention','delivery')),
  resource_id uuid, idempotency_key text not null unique, status text not null default 'queued' check (status in ('queued','leased','complete','failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0), available_at timestamptz not null default now(), leased_at timestamptz,
  last_error_code text, created_at timestamptz not null default now(), completed_at timestamptz
);

alter table public.memberships drop constraint memberships_user_id_fkey;
alter table public.memberships alter column user_id drop not null;
alter table public.memberships add constraint memberships_user_id_fkey foreign key (user_id) references public.profiles(id) on delete set null;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('grassroots-private-exports','grassroots-private-exports',false,5242880,array['application/json'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create function public.enqueue_published_announcement_deliveries()
returns trigger language plpgsql security definer set search_path='' as $$
declare should_enqueue boolean := tg_op='INSERT';
begin
  if tg_op='UPDATE' then should_enqueue := old.status is distinct from 'published'; end if;
  if new.status='published' and should_enqueue then
    insert into public.announcement_recipients (organisation_id,announcement_id,membership_id)
    select new.organisation_id,new.id,audience.membership_id from (
      select membership.id as membership_id from public.memberships membership where new.team_id is null and membership.organisation_id=new.organisation_id and membership.status='active'
      union select team_audience.membership_id from public.team_audience_members(new.organisation_id,new.team_id) team_audience where new.team_id is not null
    ) audience
    on conflict (organisation_id,announcement_id,membership_id) do nothing;
    insert into public.communication_deliveries (organisation_id,recipient_membership_id,resource_type,resource_id,channel,provider,status,idempotency_key)
    select new.organisation_id,audience.membership_id,'announcement',new.id,'in-app','internal','pending','announcement:'||new.id||':in-app:'||audience.membership_id
    from (
      select membership.id as membership_id from public.memberships membership where new.team_id is null and membership.organisation_id=new.organisation_id and membership.status='active'
      union select team_audience.membership_id from public.team_audience_members(new.organisation_id,new.team_id) team_audience where new.team_id is not null
    ) audience
    on conflict (organisation_id,idempotency_key) do nothing;
  end if;
  return new;
end; $$;
create trigger announcements_enqueue_deliveries after insert or update of status on public.announcements
for each row execute function public.enqueue_published_announcement_deliveries();

create function public.enqueue_communication_delivery_job()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.background_jobs (organisation_id,kind,resource_id,idempotency_key)
  values (new.organisation_id,'delivery',new.id,'delivery:'||new.id) on conflict (idempotency_key) do nothing;
  return new;
end; $$;
create trigger communication_deliveries_enqueue after insert on public.communication_deliveries
for each row execute function public.enqueue_communication_delivery_job();

create function public.lease_background_jobs(requested_limit integer default 20)
returns setof public.background_jobs language plpgsql security definer set search_path='' as $$
begin
  if current_user not in ('postgres','service_role','supabase_admin') then raise exception 'service role required' using errcode='42501'; end if;
  return query
  with candidates as (
    select job.id from public.background_jobs job where ((job.status in ('queued','failed') and job.available_at<=now()) or (job.status='leased' and job.leased_at<now()-interval '15 minutes')) and job.attempt_count<8
    order by job.available_at for update skip locked limit greatest(1,least(requested_limit,100))
  )
  update public.background_jobs job set status='leased',leased_at=now(),attempt_count=job.attempt_count+1,last_error_code=null
  from candidates where job.id=candidates.id returning job.*;
end; $$;

create function public.finish_background_job(requested_job_id uuid, requested_success boolean, requested_error_code text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  if current_user not in ('postgres','service_role','supabase_admin') then raise exception 'service role required' using errcode='42501'; end if;
  if requested_success then
    update public.background_jobs set status='complete',completed_at=now(),leased_at=null,last_error_code=null where id=requested_job_id and status='leased';
  else
    update public.background_jobs set status='failed',available_at=now()+least(attempt_count,8)*interval '5 minutes',leased_at=null,last_error_code=left(coalesce(requested_error_code,'worker-failed'),80) where id=requested_job_id and status='leased';
  end if;
end; $$;

create function public.enqueue_due_retention_jobs()
returns integer language plpgsql security definer set search_path='' as $$
declare queued integer;
begin
  if current_user not in ('postgres','service_role','supabase_admin') then raise exception 'service role required' using errcode='42501'; end if;
  insert into public.background_jobs (organisation_id,kind,resource_id,idempotency_key)
  select organisation.id,'retention',organisation.id,'retention:'||organisation.id||':'||current_date
  from public.organisations organisation
  where exists (select 1 from public.retention_policies policy where policy.organisation_id=organisation.id and policy.active)
  on conflict (idempotency_key) do nothing;
  get diagnostics queued=row_count;
  return queued;
end; $$;

create function public.run_retention_sweep(requested_organisation_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare removed integer := 0; affected integer;
begin
  if current_user not in ('postgres','service_role','supabase_admin') then raise exception 'service role required' using errcode='42501'; end if;
  delete from public.communication_deliveries delivery
  using public.retention_policies policy
  where policy.organisation_id=requested_organisation_id and policy.active and policy.resource_type='communication-delivery'
    and delivery.organisation_id=policy.organisation_id and delivery.created_at < now() - make_interval(days=>policy.retain_days);
  get diagnostics affected=row_count; removed:=removed+affected;
  delete from public.sensitive_access_log access_log
  using public.retention_policies policy
  where policy.organisation_id=requested_organisation_id and policy.active and policy.resource_type='sensitive-access-log'
    and access_log.organisation_id=policy.organisation_id and access_log.occurred_at < now() - make_interval(days=>policy.retain_days);
  get diagnostics affected=row_count; removed:=removed+affected;
  return removed;
end; $$;

create function public.prepare_account_erasure(requested_user_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
  if current_user not in ('postgres','service_role','supabase_admin') then raise exception 'service role required' using errcode='42501'; end if;
  if exists (select 1 from public.organisation_lifecycle lifecycle join public.memberships membership on membership.id=lifecycle.owner_membership_id and membership.organisation_id=lifecycle.organisation_id where membership.user_id=requested_user_id) then raise exception 'owned organisations must be transferred or deleted before account erasure' using errcode='55000'; end if;
  update public.support_sessions set revoked_by_user_id=null where revoked_by_user_id=requested_user_id;
  update public.guardians set display_name='Deleted guardian',email='deleted+'||id||'@invalid.local',status='inactive',updated_at=now()
  where membership_id in (select id from public.memberships where user_id=requested_user_id);
  update public.coaches set display_name='Deleted coach',status='inactive',updated_at=now()
  where membership_id in (select id from public.memberships where user_id=requested_user_id);
  update public.volunteers set display_name='Deleted volunteer',status='inactive',updated_at=now()
  where membership_id in (select id from public.memberships where user_id=requested_user_id);
  update public.conversation_messages set body='Message removed following account deletion.',moderation_state='removed',edited_at=now()
  where author_membership_id in (select id from public.memberships where user_id=requested_user_id);
  update public.conversation_participants set left_at=coalesce(left_at,now())
  where membership_id in (select id from public.memberships where user_id=requested_user_id);
  delete from public.communication_preferences where membership_id in (select id from public.memberships where user_id=requested_user_id);
  delete from public.push_subscriptions where membership_id in (select id from public.memberships where user_id=requested_user_id);
  delete from public.scoped_role_assignments where membership_id in (select id from public.memberships where user_id=requested_user_id);
  update public.memberships set status='suspended',user_id=null where user_id=requested_user_id;
  get diagnostics affected=row_count;
  return affected;
end; $$;

create table public.platform_feature_flags (
  id uuid primary key default gen_random_uuid(), key text not null unique, description text not null, enabled_by_default boolean not null default false,
  owner text not null, expires_at timestamptz, created_at timestamptz not null default now()
);

create table public.organisation_feature_flags (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  feature_flag_id uuid not null references public.platform_feature_flags(id) on delete cascade, enabled boolean not null,
  rationale text not null, expires_at timestamptz, created_at timestamptz not null default now(), unique (organisation_id, feature_flag_id)
);

create function public.ensure_organisation_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.roles role where role.id = new.role_id and role.organisation_id = new.organisation_id and role.key = 'owner') then
    insert into public.organisation_lifecycle (organisation_id,owner_membership_id)
    values (new.organisation_id,new.membership_id)
    on conflict (organisation_id) do nothing;
    insert into public.platform_subscriptions (organisation_id,plan_id,status,trial_ends_at)
    select new.organisation_id,plan.id,'trialing',now()+interval '14 days' from public.platform_plans plan where plan.code='trial'
    on conflict (organisation_id) do nothing;
  end if;
  return new;
end; $$;
create trigger role_assignments_ensure_lifecycle after insert on public.scoped_role_assignments
for each row execute function public.ensure_organisation_lifecycle();

insert into public.organisation_lifecycle (organisation_id,owner_membership_id)
select distinct on (assignment.organisation_id) assignment.organisation_id, assignment.membership_id
from public.scoped_role_assignments assignment join public.roles role on role.id = assignment.role_id and role.organisation_id = assignment.organisation_id
join public.memberships membership on membership.id = assignment.membership_id and membership.organisation_id = assignment.organisation_id
where role.key = 'owner' and membership.status = 'active'
order by assignment.organisation_id, assignment.created_at
on conflict (organisation_id) do nothing;

insert into public.platform_subscriptions (organisation_id,plan_id,status,trial_ends_at)
select lifecycle.organisation_id,plan.id,'trialing',lifecycle.trial_ends_at from public.organisation_lifecycle lifecycle cross join public.platform_plans plan
where plan.code='trial'
on conflict (organisation_id) do nothing;

create function public.respond_to_consent(requested_organisation_id uuid, requested_definition_version_id uuid, requested_player_id uuid, requested_decision text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare guardian_id uuid; response_id uuid;
begin
  if requested_decision not in ('granted','declined') then raise exception 'invalid consent decision'; end if;
  if not exists (
    select 1 from public.consent_definition_versions version join public.consent_definitions definition on definition.id=version.definition_id and definition.organisation_id=version.organisation_id and definition.active
    where version.id=requested_definition_version_id and version.organisation_id=requested_organisation_id and version.retired_at is null
      and version.version=(select max(candidate.version) from public.consent_definition_versions candidate where candidate.organisation_id=version.organisation_id and candidate.definition_id=version.definition_id and candidate.retired_at is null)
  ) then raise exception 'consent response must use the current published version'; end if;
  select g.id into guardian_id from public.guardians g join public.memberships m on m.id = g.membership_id and m.organisation_id = g.organisation_id
  join public.player_guardians pg on pg.guardian_id = g.id and pg.organisation_id = g.organisation_id and pg.player_id = requested_player_id
  join public.guardian_permissions gp on gp.player_guardian_id = pg.id and gp.organisation_id = pg.organisation_id and gp.consent
  where g.organisation_id = requested_organisation_id and g.status='active' and m.user_id = auth.uid() and m.status = 'active';
  if guardian_id is null then raise exception 'not authorised' using errcode = '42501'; end if;
  insert into public.consent_responses (organisation_id,definition_version_id,player_id,guardian_id,decision)
  values (requested_organisation_id,requested_definition_version_id,requested_player_id,guardian_id,requested_decision)
  returning id into response_id;
  return response_id;
end; $$;

create function public.create_consent_definition(requested_organisation_id uuid, requested_key text, requested_title text, requested_purpose text, requested_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor_id uuid; definition_id uuid;
begin
  if not public.has_capability(requested_organisation_id,'consents:manage','organisation',requested_organisation_id,null) then raise exception 'not authorised' using errcode='42501'; end if;
  select id into actor_id from public.memberships where organisation_id=requested_organisation_id and user_id=auth.uid() and status='active';
  if actor_id is null then raise exception 'active membership required' using errcode='42501'; end if;
  insert into public.consent_definitions (organisation_id,key,title,purpose,created_by_membership_id)
  values (requested_organisation_id,requested_key,requested_title,requested_purpose,actor_id) returning id into definition_id;
  insert into public.consent_definition_versions (organisation_id,definition_id,version,body,published_by_membership_id,published_at)
  values (requested_organisation_id,definition_id,1,requested_body,actor_id,now());
  return definition_id;
end; $$;

create function public.publish_consent_version(requested_organisation_id uuid, requested_definition_id uuid, requested_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor_id uuid; next_version integer; version_id uuid;
begin
  if not public.has_capability(requested_organisation_id,'consents:manage','organisation',requested_organisation_id,null) then raise exception 'not authorised' using errcode='42501'; end if;
  select id into actor_id from public.memberships where organisation_id=requested_organisation_id and user_id=auth.uid() and status='active';
  perform 1 from public.consent_definitions where id=requested_definition_id and organisation_id=requested_organisation_id and active for update;
  if not found or actor_id is null then raise exception 'active consent definition unavailable' using errcode='42501'; end if;
  select coalesce(max(version),0)+1 into next_version from public.consent_definition_versions where organisation_id=requested_organisation_id and definition_id=requested_definition_id;
  insert into public.consent_definition_versions (organisation_id,definition_id,version,body,published_by_membership_id,published_at)
  values (requested_organisation_id,requested_definition_id,next_version,requested_body,actor_id,now()) returning id into version_id;
  return version_id;
end; $$;

create function public.list_current_guardian_consent_requests(requested_organisation_id uuid)
returns table (
  definition_version_id uuid, definition_title text, version integer, player_id uuid, player_name text,
  response_id uuid, decision text, withdrawn_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select version.id, definition.title, version.version, player.id, player.first_name || ' ' || player.last_name,
    response.id, response.decision, response.withdrawn_at
  from public.guardians guardian
  join public.memberships membership on membership.id=guardian.membership_id and membership.organisation_id=guardian.organisation_id and membership.status='active'
  join public.player_guardians link on link.guardian_id=guardian.id and link.organisation_id=guardian.organisation_id
  join public.guardian_permissions permission on permission.player_guardian_id=link.id and permission.organisation_id=link.organisation_id and permission.consent
  join public.players player on player.id=link.player_id and player.organisation_id=link.organisation_id and player.status='active'
  cross join lateral (
    select definition_row.id, definition_row.title
    from public.consent_definitions definition_row
    where definition_row.organisation_id=requested_organisation_id and definition_row.active
  ) definition
  join lateral (
    select version_row.id, version_row.version
    from public.consent_definition_versions version_row
    where version_row.organisation_id=requested_organisation_id and version_row.definition_id=definition.id and version_row.retired_at is null
    order by version_row.version desc limit 1
  ) version on true
  left join public.consent_responses response on response.organisation_id=requested_organisation_id and response.definition_version_id=version.id and response.player_id=player.id and response.guardian_id=guardian.id
  where guardian.organisation_id=requested_organisation_id and guardian.status='active' and membership.user_id=auth.uid()
  order by definition.title, player.first_name, player.last_name;
$$;

create function public.withdraw_consent(requested_organisation_id uuid, requested_response_id uuid, requested_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if length(btrim(requested_reason)) < 2 then raise exception 'withdrawal reason is required'; end if;
  update public.consent_responses response set withdrawn_at = now(), withdrawal_reason = requested_reason
  from public.guardians g
  join public.memberships m on m.id = g.membership_id and m.organisation_id = g.organisation_id and m.status='active'
  join public.player_guardians link on link.guardian_id=g.id and link.organisation_id=g.organisation_id
  join public.guardian_permissions permission on permission.player_guardian_id=link.id and permission.organisation_id=link.organisation_id and permission.consent
  where response.id = requested_response_id and response.organisation_id = requested_organisation_id and response.guardian_id = g.id
    and link.player_id=response.player_id and g.organisation_id = requested_organisation_id and g.status='active' and m.user_id = auth.uid() and response.withdrawn_at is null;
  if not found then raise exception 'consent response unavailable' using errcode = '42501'; end if;
end; $$;

create function public.upsert_player_medical_profile(requested_organisation_id uuid, requested_player_id uuid, requested_emergency_summary text, requested_clinical_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid; profile_id uuid;
begin
  if not public.has_capability(requested_organisation_id,'safeguarding:view','organisation',requested_organisation_id,null) then raise exception 'not authorised' using errcode='42501'; end if;
  select id into actor_id from public.memberships where organisation_id=requested_organisation_id and user_id=auth.uid() and status='active';
  insert into public.player_medical_profiles (organisation_id,player_id,emergency_summary,clinical_notes,updated_by_membership_id,reviewed_at)
  values (requested_organisation_id,requested_player_id,requested_emergency_summary,requested_clinical_notes,actor_id,now())
  on conflict (organisation_id,player_id) do update set emergency_summary=excluded.emergency_summary,clinical_notes=excluded.clinical_notes,updated_by_membership_id=excluded.updated_by_membership_id,reviewed_at=now(),updated_at=now()
  returning id into profile_id;
  insert into public.sensitive_access_log (organisation_id,actor_membership_id,resource_type,resource_id,action,outcome,reason_code)
  values (requested_organisation_id,actor_id,'medical-profile',requested_player_id,'write','allowed','welfare.medical.update');
  return profile_id;
end; $$;

create function public.record_safeguarding_action(requested_organisation_id uuid, requested_concern_id uuid, requested_action_type text, requested_detail text, requested_next_status text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid; action_id uuid;
begin
  if not public.has_capability(requested_organisation_id,'safeguarding:view','organisation',requested_organisation_id,null) then raise exception 'not authorised' using errcode='42501'; end if;
  if requested_action_type not in ('note','assign','refer','status-change','close') or length(btrim(requested_detail)) < 2 then raise exception 'invalid safeguarding action'; end if;
  select id into actor_id from public.memberships where organisation_id=requested_organisation_id and user_id=auth.uid() and status='active';
  perform pg_advisory_xact_lock(hashtextextended(requested_concern_id::text,0));
  if not exists (select 1 from public.safeguarding_concerns where id=requested_concern_id and organisation_id=requested_organisation_id for update) then raise exception 'concern not found'; end if;
  insert into public.safeguarding_actions (organisation_id,concern_id,actor_membership_id,action_type,detail)
  values (requested_organisation_id,requested_concern_id,actor_id,requested_action_type,requested_detail) returning id into action_id;
  if requested_next_status is not null then
    if requested_next_status not in ('open','assessing','referred','closed') then raise exception 'invalid concern status'; end if;
    update public.safeguarding_concerns set status=requested_next_status,closed_at=case when requested_next_status='closed' then now() else null end,updated_at=now()
    where id=requested_concern_id and organisation_id=requested_organisation_id;
  end if;
  insert into public.sensitive_access_log (organisation_id,actor_membership_id,resource_type,resource_id,action,outcome,reason_code)
  values (requested_organisation_id,actor_id,'safeguarding-action',action_id,'write','allowed',requested_action_type);
  return action_id;
end; $$;

create function public.read_emergency_player_profile(requested_organisation_id uuid, requested_player_id uuid, requested_reason_code text)
returns table (player_id uuid, emergency_summary text, contact_name text, contact_phone text)
language plpgsql security definer set search_path = '' as $$
declare actor_id uuid; allowed boolean;
begin
  select id into actor_id from public.memberships where organisation_id = requested_organisation_id and user_id = auth.uid() and status = 'active';
  if actor_id is null then raise exception 'not authorised' using errcode='42501'; end if;
  allowed := actor_id is not null and public.has_capability(requested_organisation_id,'safeguarding:view','organisation',requested_organisation_id,null);
  insert into public.sensitive_access_log (organisation_id,actor_membership_id,resource_type,resource_id,action,outcome,reason_code)
  values (requested_organisation_id,actor_id,'medical-profile',requested_player_id,'emergency-read',case when allowed then 'allowed' else 'denied' end,requested_reason_code);
  if not allowed then return; end if;
  return query select medical.player_id, medical.emergency_summary, contact.contact_name, contact.contact_phone
  from public.player_medical_profiles medical left join lateral (
    select ec.contact_name, ec.contact_phone from public.player_emergency_contacts ec
    where ec.organisation_id = medical.organisation_id and ec.player_id = medical.player_id order by ec.priority limit 1
  ) contact on true where medical.organisation_id = requested_organisation_id and medical.player_id = requested_player_id;
end; $$;

create function public.read_safeguarding_concern(requested_organisation_id uuid, requested_concern_id uuid, requested_reason_code text)
returns table (id uuid, category text, summary text, detail text, risk_level text, status text)
language plpgsql security definer set search_path = '' as $$
declare actor_id uuid; allowed boolean;
begin
  select membership.id into actor_id from public.memberships membership where membership.organisation_id = requested_organisation_id and membership.user_id = auth.uid() and membership.status = 'active';
  if actor_id is null then raise exception 'not authorised' using errcode='42501'; end if;
  allowed := actor_id is not null and public.has_capability(requested_organisation_id,'safeguarding:view','organisation',requested_organisation_id,null);
  insert into public.sensitive_access_log (organisation_id,actor_membership_id,resource_type,resource_id,action,outcome,reason_code)
  values (requested_organisation_id,actor_id,'safeguarding-concern',requested_concern_id,'read',case when allowed then 'allowed' else 'denied' end,requested_reason_code);
  if not allowed then return; end if;
  return query select concern.id,concern.category,concern.summary,concern.detail,concern.risk_level,concern.status
  from public.safeguarding_concerns concern where concern.organisation_id = requested_organisation_id and concern.id = requested_concern_id;
end; $$;

create function public.list_safeguarding_concern_metadata(requested_organisation_id uuid, requested_reason_code text)
returns table (id uuid, category text, risk_level text, status text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare actor_id uuid; allowed boolean;
begin
  select membership.id into actor_id from public.memberships membership where membership.organisation_id=requested_organisation_id and membership.user_id=auth.uid() and membership.status='active';
  if actor_id is null then raise exception 'not authorised' using errcode='42501'; end if;
  allowed := actor_id is not null and public.has_capability(requested_organisation_id,'safeguarding:view','organisation',requested_organisation_id,null);
  insert into public.sensitive_access_log (organisation_id,actor_membership_id,resource_type,resource_id,action,outcome,reason_code)
  values (requested_organisation_id,actor_id,'safeguarding-concern',requested_organisation_id,'list-metadata',case when allowed then 'allowed' else 'denied' end,requested_reason_code);
  if not allowed then return; end if;
  return query select concern.id,concern.category,concern.risk_level,concern.status,concern.created_at
  from public.safeguarding_concerns concern where concern.organisation_id=requested_organisation_id order by concern.created_at desc;
end; $$;

create function public.raise_safeguarding_concern(requested_organisation_id uuid, requested_category text, requested_summary text, requested_detail text, requested_risk_level text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid; concern_id uuid;
begin
  select id into actor_id from public.memberships where organisation_id = requested_organisation_id and user_id = auth.uid() and status = 'active';
  if actor_id is null then raise exception 'not authorised' using errcode = '42501'; end if;
  insert into public.safeguarding_concerns (organisation_id,raised_by_membership_id,category,summary,detail,risk_level)
  values (requested_organisation_id,actor_id,requested_category,requested_summary,requested_detail,requested_risk_level) returning id into concern_id;
  insert into public.audit_log (organisation_id,actor_membership_id,action,resource_type,resource_id,metadata)
  values (requested_organisation_id,actor_id,'safeguarding-concern.raised','safeguarding-concern',concern_id,jsonb_build_object('risk_level',requested_risk_level));
  return concern_id;
end; $$;

create function public.transfer_organisation_ownership(requested_organisation_id uuid, requested_next_owner_membership_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare current_owner uuid; owner_role_id uuid;
begin
  select lifecycle.owner_membership_id into current_owner from public.organisation_lifecycle lifecycle join public.memberships membership on membership.id = lifecycle.owner_membership_id and membership.organisation_id = lifecycle.organisation_id
  where lifecycle.organisation_id = requested_organisation_id and membership.user_id = auth.uid() and membership.status='active' for update;
  if current_owner is null then raise exception 'only current owner may transfer ownership' using errcode = '42501'; end if;
  if not exists (select 1 from public.memberships where id = requested_next_owner_membership_id and organisation_id = requested_organisation_id and status = 'active') then raise exception 'next owner must be an active member'; end if;
  select id into owner_role_id from public.roles where organisation_id=requested_organisation_id and key='owner';
  if owner_role_id is null then raise exception 'canonical owner role is missing'; end if;
  insert into public.ownership_transfers (organisation_id,from_membership_id,to_membership_id) values (requested_organisation_id,current_owner,requested_next_owner_membership_id);
  delete from public.scoped_role_assignments where organisation_id=requested_organisation_id and role_id=owner_role_id and scope_kind='organisation' and scope_id=requested_organisation_id;
  insert into public.scoped_role_assignments (organisation_id,membership_id,role_id,scope_kind,scope_id)
  values (requested_organisation_id,requested_next_owner_membership_id,owner_role_id,'organisation',requested_organisation_id);
  update public.organisation_lifecycle set owner_membership_id = requested_next_owner_membership_id, updated_at = now() where organisation_id = requested_organisation_id;
  insert into public.audit_log (organisation_id,actor_membership_id,action,resource_type,resource_id,metadata)
  values (requested_organisation_id,current_owner,'organisation.ownership-transferred','organisation',requested_organisation_id,jsonb_build_object('from_membership_id',current_owner,'to_membership_id',requested_next_owner_membership_id));
end; $$;

create function public.schedule_organisation_deletion(requested_organisation_id uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare actor_id uuid; current_status text; scheduled_at timestamptz := now() + interval '30 days';
begin
  select owner_membership_id,lifecycle.deletion_status into actor_id,current_status from public.organisation_lifecycle lifecycle join public.memberships membership on membership.id = lifecycle.owner_membership_id and membership.organisation_id = lifecycle.organisation_id
  where lifecycle.organisation_id = requested_organisation_id and membership.user_id = auth.uid() and membership.status='active' for update;
  if actor_id is null then raise exception 'only current owner may schedule deletion' using errcode = '42501'; end if;
  if current_status not in ('active','scheduled') then raise exception 'retention hold or processing state prevents scheduling' using errcode='55000'; end if;
  if exists (select 1 from public.background_jobs where idempotency_key='organisation-delete:'||requested_organisation_id and status='leased') then raise exception 'deletion is already being processed'; end if;
  update public.organisation_lifecycle set deletion_status = 'scheduled', delete_after = scheduled_at, updated_at = now() where organisation_id = requested_organisation_id;
  insert into public.background_jobs (organisation_id,kind,resource_id,idempotency_key,available_at)
  values (requested_organisation_id,'organisation-deletion',requested_organisation_id,'organisation-delete:'||requested_organisation_id,scheduled_at)
  on conflict (idempotency_key) do update set status='queued',available_at=excluded.available_at,attempt_count=0,leased_at=null,last_error_code=null,completed_at=null;
  return scheduled_at;
end; $$;

create function public.cancel_organisation_deletion(requested_organisation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_id uuid;
begin
  select lifecycle.owner_membership_id into actor_id
  from public.organisation_lifecycle lifecycle
  join public.memberships membership on membership.id=lifecycle.owner_membership_id and membership.organisation_id=lifecycle.organisation_id
  where lifecycle.organisation_id=requested_organisation_id and membership.user_id=auth.uid() and membership.status='active'
  for update;
  if actor_id is null then raise exception 'only current owner may cancel deletion' using errcode='42501'; end if;
  if exists (select 1 from public.background_jobs where idempotency_key='organisation-delete:'||requested_organisation_id and status='leased') then
    raise exception 'deletion is already being processed';
  end if;
  update public.organisation_lifecycle set deletion_status='active',delete_after=null,updated_at=now()
  where organisation_id=requested_organisation_id and deletion_status='scheduled';
  if not found then raise exception 'organisation deletion is not scheduled'; end if;
  delete from public.background_jobs where idempotency_key='organisation-delete:'||requested_organisation_id and status in ('queued','failed');
  insert into public.audit_log (organisation_id,actor_membership_id,action,resource_type,resource_id)
  values (requested_organisation_id,actor_id,'organisation.deletion-cancelled','organisation',requested_organisation_id);
end; $$;

create function public.request_account_export(requested_organisation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid; export_id uuid;
begin
  select id into actor_id from public.memberships where organisation_id=requested_organisation_id and user_id=auth.uid() and status='active';
  if actor_id is null then raise exception 'active membership required' using errcode='42501'; end if;
  insert into public.data_export_requests (organisation_id,requested_by_membership_id,subject_user_id,scope)
  values (requested_organisation_id,actor_id,auth.uid(),'account') returning id into export_id;
  insert into public.background_jobs (organisation_id,kind,resource_id,idempotency_key)
  values (requested_organisation_id,'export',export_id,'account-export:'||export_id);
  return export_id;
end; $$;

create function public.schedule_account_deletion()
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare scheduled_at timestamptz := now()+interval '30 days'; deletion_id uuid; current_status text;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if exists (
    select 1 from public.organisation_lifecycle lifecycle join public.memberships membership on membership.id=lifecycle.owner_membership_id and membership.organisation_id=lifecycle.organisation_id
    where membership.user_id=auth.uid()
  ) then raise exception 'transfer or delete owned organisations first'; end if;
  select status into current_status from public.account_deletion_requests where user_id=auth.uid() for update;
  if current_status in ('retention-hold','processing') then raise exception 'retention hold or processing state prevents scheduling' using errcode='55000'; end if;
  if exists (select 1 from public.background_jobs job join public.account_deletion_requests request on request.id=job.resource_id where request.user_id=auth.uid() and job.status='leased') then raise exception 'account deletion is already being processed' using errcode='55000'; end if;
  insert into public.account_deletion_requests (user_id,delete_after) values (auth.uid(),scheduled_at)
  on conflict (user_id) do update set status='scheduled',requested_at=now(),delete_after=excluded.delete_after,completed_at=null
  returning id into deletion_id;
  insert into public.background_jobs (kind,resource_id,idempotency_key,available_at)
  values ('account-deletion',deletion_id,'account-delete:'||auth.uid(),scheduled_at)
  on conflict (idempotency_key) do update set status='queued',available_at=excluded.available_at,attempt_count=0,last_error_code=null;
  return scheduled_at;
end; $$;

create index consent_versions_definition_idx on public.consent_definition_versions (organisation_id, definition_id, version desc);
create index consent_responses_player_idx on public.consent_responses (organisation_id, player_id, responded_at desc);
create index medical_player_idx on public.player_medical_profiles (organisation_id, player_id);
create index concerns_workflow_idx on public.safeguarding_concerns (organisation_id, status, risk_level, created_at);
create index safeguarding_actions_concern_idx on public.safeguarding_actions (organisation_id, concern_id, created_at);
create index qualifications_expiry_idx on public.workforce_qualifications (organisation_id, expires_on) where expires_on is not null;
create index checks_expiry_idx on public.workforce_checks (organisation_id, expires_on) where expires_on is not null;
create index sensitive_access_resource_idx on public.sensitive_access_log (organisation_id, resource_type, resource_id, occurred_at desc);
create index jobs_queue_idx on public.background_jobs (status, available_at) where status in ('queued','failed');

alter table public.consent_definitions enable row level security; alter table public.consent_definition_versions enable row level security; alter table public.consent_responses enable row level security;
alter table public.player_emergency_contacts enable row level security; alter table public.player_medical_profiles enable row level security;
alter table public.safeguarding_concerns enable row level security; alter table public.safeguarding_actions enable row level security;
alter table public.workforce_checks enable row level security; alter table public.workforce_qualifications enable row level security;
alter table public.club_policies enable row level security; alter table public.club_policy_versions enable row level security; alter table public.club_policy_acknowledgements enable row level security;
alter table public.sensitive_access_log enable row level security; alter table public.equipment_loans enable row level security; alter table public.operational_tasks enable row level security;
alter table public.stored_files enable row level security; alter table public.data_export_requests enable row level security; alter table public.account_deletion_requests enable row level security;
alter table public.organisation_lifecycle enable row level security; alter table public.ownership_transfers enable row level security; alter table public.retention_policies enable row level security;
alter table public.background_jobs enable row level security; alter table public.platform_feature_flags enable row level security; alter table public.organisation_feature_flags enable row level security;

create policy consent_definitions_read on public.consent_definitions for select to authenticated using (public.has_active_membership(organisation_id));
create policy consent_versions_read on public.consent_definition_versions for select to authenticated using (public.has_active_membership(organisation_id));
create policy consent_manage on public.consent_definitions for all to authenticated using (public.has_capability(organisation_id,'consents:manage','organisation',organisation_id,null)) with check (public.has_capability(organisation_id,'consents:manage','organisation',organisation_id,null));
create policy consent_response_read on public.consent_responses for select to authenticated using (public.has_capability(organisation_id,'consents:manage','organisation',organisation_id,null) or exists (select 1 from public.guardians guardian join public.memberships membership on membership.id=guardian.membership_id and membership.organisation_id=guardian.organisation_id and membership.status='active' join public.player_guardians link on link.organisation_id=consent_responses.organisation_id and link.player_id=consent_responses.player_id and link.guardian_id=guardian.id join public.guardian_permissions permission on permission.organisation_id=link.organisation_id and permission.player_guardian_id=link.id and permission.consent where guardian.id=consent_responses.guardian_id and guardian.organisation_id=consent_responses.organisation_id and guardian.status='active' and membership.user_id=auth.uid()));
create policy workforce_manage_checks on public.workforce_checks for all to authenticated using (public.has_capability(organisation_id,'compliance:manage','organisation',organisation_id,null)) with check (public.has_capability(organisation_id,'compliance:manage','organisation',organisation_id,null));
create policy workforce_manage_qualifications on public.workforce_qualifications for all to authenticated using (public.has_capability(organisation_id,'compliance:manage','organisation',organisation_id,null)) with check (public.has_capability(organisation_id,'compliance:manage','organisation',organisation_id,null));
create policy policies_member_read on public.club_policies for select to authenticated using (public.has_active_membership(organisation_id));
create policy policy_versions_member_read on public.club_policy_versions for select to authenticated using (public.has_active_membership(organisation_id));
create policy policy_acks_own on public.club_policy_acknowledgements for all to authenticated using (exists (select 1 from public.memberships m where m.id=membership_id and m.organisation_id=organisation_id and m.user_id=auth.uid())) with check (exists (select 1 from public.memberships m where m.id=membership_id and m.organisation_id=organisation_id and m.user_id=auth.uid()));
create policy sensitive_access_welfare_read on public.sensitive_access_log for select to authenticated using (public.has_capability(organisation_id,'safeguarding:view','organisation',organisation_id,null));
create policy equipment_loans_manage on public.equipment_loans for all to authenticated using (public.has_capability(organisation_id,'equipment:manage','organisation',organisation_id,null)) with check (public.has_capability(organisation_id,'equipment:manage','organisation',organisation_id,null));
create policy tasks_member_read on public.operational_tasks for select to authenticated using (public.has_active_membership(organisation_id));
create policy tasks_admin_write on public.operational_tasks for all to authenticated using (public.has_capability(organisation_id,'club:manage','organisation',organisation_id,null)) with check (public.has_capability(organisation_id,'club:manage','organisation',organisation_id,null));
create policy exports_requester_read on public.data_export_requests for select to authenticated using ((scope='account' and subject_user_id=auth.uid() and exists (select 1 from public.memberships m where m.id=requested_by_membership_id and m.organisation_id=organisation_id and m.user_id=auth.uid())) or (scope in ('organisation','report') and public.has_capability(organisation_id,'reports:view','organisation',organisation_id,null)));
create policy account_deletion_own on public.account_deletion_requests for select to authenticated using (user_id = auth.uid());
create policy lifecycle_tenant_read on public.organisation_lifecycle for select to authenticated using (public.has_capability(organisation_id,'club:manage','organisation',organisation_id,null) or public.has_capability(organisation_id,'entitlements:view','organisation',organisation_id,null));
create policy lifecycle_platform_read on public.organisation_lifecycle for select to authenticated using (public.is_platform_operator());
create policy ownership_owner_read on public.ownership_transfers for select to authenticated using (public.has_capability(organisation_id,'club:manage','organisation',organisation_id,null));
create policy retention_admin on public.retention_policies for all to authenticated using (public.has_capability(organisation_id,'club:manage','organisation',organisation_id,null)) with check (public.has_capability(organisation_id,'club:manage','organisation',organisation_id,null));
create policy org_flags_admin_read on public.organisation_feature_flags for select to authenticated using (public.has_capability(organisation_id,'entitlements:view','organisation',organisation_id,null));
create policy org_flags_platform_read on public.organisation_feature_flags for select to authenticated using (public.is_platform_operator());
create policy platform_flags_operator_read on public.platform_feature_flags for select to authenticated using (public.is_platform_operator());
create policy sensitive_access_platform_read on public.sensitive_access_log for select to authenticated using (public.is_platform_operator());

revoke all on function public.respond_to_consent(uuid,uuid,uuid,text), public.create_consent_definition(uuid,text,text,text,text), public.publish_consent_version(uuid,uuid,text), public.list_current_guardian_consent_requests(uuid), public.withdraw_consent(uuid,uuid,text), public.upsert_player_medical_profile(uuid,uuid,text,text), public.record_safeguarding_action(uuid,uuid,text,text,text), public.read_emergency_player_profile(uuid,uuid,text), public.read_safeguarding_concern(uuid,uuid,text), public.list_safeguarding_concern_metadata(uuid,text), public.raise_safeguarding_concern(uuid,text,text,text,text), public.transfer_organisation_ownership(uuid,uuid), public.schedule_organisation_deletion(uuid), public.cancel_organisation_deletion(uuid), public.request_account_export(uuid), public.schedule_account_deletion() from public;
grant execute on function public.respond_to_consent(uuid,uuid,uuid,text), public.create_consent_definition(uuid,text,text,text,text), public.publish_consent_version(uuid,uuid,text), public.list_current_guardian_consent_requests(uuid), public.withdraw_consent(uuid,uuid,text), public.upsert_player_medical_profile(uuid,uuid,text,text), public.record_safeguarding_action(uuid,uuid,text,text,text), public.read_emergency_player_profile(uuid,uuid,text), public.read_safeguarding_concern(uuid,uuid,text), public.list_safeguarding_concern_metadata(uuid,text), public.raise_safeguarding_concern(uuid,text,text,text,text), public.transfer_organisation_ownership(uuid,uuid), public.schedule_organisation_deletion(uuid), public.cancel_organisation_deletion(uuid), public.request_account_export(uuid), public.schedule_account_deletion() to authenticated;
revoke all on function public.lease_background_jobs(integer), public.finish_background_job(uuid,boolean,text), public.enqueue_due_retention_jobs(), public.run_retention_sweep(uuid), public.prepare_account_erasure(uuid) from public;
grant execute on function public.lease_background_jobs(integer), public.finish_background_job(uuid,boolean,text), public.enqueue_due_retention_jobs(), public.run_retention_sweep(uuid), public.prepare_account_erasure(uuid) to service_role;

revoke all on table public.player_emergency_contacts, public.player_medical_profiles, public.safeguarding_concerns, public.safeguarding_actions, public.stored_files, public.background_jobs from authenticated;
revoke all on table public.consent_definitions, public.consent_definition_versions, public.consent_responses, public.workforce_checks, public.workforce_qualifications, public.club_policies, public.club_policy_versions, public.club_policy_acknowledgements, public.sensitive_access_log, public.equipment_loans, public.operational_tasks, public.data_export_requests, public.account_deletion_requests, public.organisation_lifecycle, public.ownership_transfers, public.retention_policies, public.platform_feature_flags, public.organisation_feature_flags from authenticated;
grant select,insert,update,delete on public.workforce_checks, public.workforce_qualifications, public.club_policies, public.club_policy_versions, public.retention_policies to authenticated;
grant select on public.consent_definitions, public.consent_definition_versions to authenticated;
grant select on public.consent_responses, public.sensitive_access_log, public.organisation_lifecycle, public.ownership_transfers, public.organisation_feature_flags to authenticated;
grant select,insert,update on public.club_policy_acknowledgements, public.equipment_loans, public.operational_tasks to authenticated;
grant select on public.data_export_requests to authenticated;
grant select on public.account_deletion_requests, public.platform_feature_flags to authenticated;

create trigger consent_definitions_set_updated_at before update on public.consent_definitions for each row execute function public.set_updated_at();
create trigger emergency_contacts_set_updated_at before update on public.player_emergency_contacts for each row execute function public.set_updated_at();
create trigger medical_profiles_set_updated_at before update on public.player_medical_profiles for each row execute function public.set_updated_at();
create trigger safeguarding_concerns_set_updated_at before update on public.safeguarding_concerns for each row execute function public.set_updated_at();
create trigger workforce_checks_set_updated_at before update on public.workforce_checks for each row execute function public.set_updated_at();
create trigger workforce_qualifications_set_updated_at before update on public.workforce_qualifications for each row execute function public.set_updated_at();
create trigger operational_tasks_set_updated_at before update on public.operational_tasks for each row execute function public.set_updated_at();
create trigger organisation_lifecycle_set_updated_at before update on public.organisation_lifecycle for each row execute function public.set_updated_at();
