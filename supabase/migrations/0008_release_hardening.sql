-- Release hardening: one-time links, private upload quarantine, corrections and session revocation.

create table public.magic_response_tokens (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  token_digest text not null unique check (token_digest ~ '^[0-9a-f]{64}$'),
  purpose text not null check (purpose in ('availability','poll','invitation')),
  subject_resource_type text not null check (subject_resource_type in ('event-instance','poll','invitation')),
  subject_resource_id uuid not null,
  guardian_id uuid,
  player_id uuid,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (guardian_id, organisation_id) references public.guardians(id, organisation_id) on delete cascade,
  foreign key (player_id, organisation_id) references public.players(id, organisation_id) on delete cascade,
  check (expires_at > created_at),
  check (consumed_at is null or revoked_at is null),
  check (
    purpose <> 'availability'
    or (subject_resource_type = 'event-instance' and guardian_id is not null and player_id is not null)
  )
);

create table public.private_upload_intents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  actor_membership_id uuid not null,
  storage_path text not null,
  original_filename text not null check (length(original_filename) between 1 and 120),
  declared_mime text not null check (declared_mime in ('image/png','image/jpeg','application/pdf')),
  declared_size bigint not null check (declared_size between 1 and 10485760),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'awaiting-upload',
  scanner_reference text,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  uploaded_at timestamptz,
  scanned_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, organisation_id),
  unique (organisation_id, storage_path),
  foreign key (actor_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  constraint private_upload_intents_status_check
    check (status in ('awaiting-upload','quarantined','scanning','clean','rejected','expired')),
  constraint private_upload_intents_storage_path_check
    check (storage_path like organisation_id::text || '/quarantine/%'),
  check (status <> 'clean' or (checksum_sha256 is not null and scanned_at is not null))
);

create table public.data_correction_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  requester_membership_id uuid not null,
  subject_user_id uuid not null references public.profiles(id) on delete cascade,
  field_key text not null check (field_key in ('display_name','guardian_email')),
  proposed_value text not null check (length(proposed_value) between 1 and 500),
  reason text not null check (length(reason) between 5 and 500),
  status text not null default 'pending' check (status in ('pending','approved','rejected','applied','cancelled')),
  decided_by_membership_id uuid,
  decision_reason text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  cancelled_at timestamptz,
  unique (id, organisation_id),
  foreign key (requester_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  foreign key (decided_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  check ((decided_at is null) = (decided_by_membership_id is null))
);

create table public.session_revocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_digest text not null unique check (session_digest ~ '^[0-9a-f]{64}$'),
  reason_code text not null check (reason_code ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz not null default now(),
  created_by_user_id uuid references public.profiles(id) on delete set null
);

create table public.security_rate_limits (
  bucket_digest text not null check (bucket_digest ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  expires_at timestamptz not null,
  primary key (bucket_digest, window_started_at)
);

create index magic_response_tokens_live_idx on public.magic_response_tokens (token_digest, expires_at) where consumed_at is null and revoked_at is null;
create index upload_intents_expiry_idx on public.private_upload_intents (status, expires_at) where status in ('awaiting-upload','quarantined','scanning');
create index correction_requests_subject_idx on public.data_correction_requests (organisation_id, subject_user_id, requested_at desc);
create index session_revocations_live_idx on public.session_revocations (session_digest, expires_at);
create index rate_limits_expiry_idx on public.security_rate_limits (expires_at);
create index events_bounded_agenda_idx on public.event_instances (organisation_id, starts_at, id) where status <> 'cancelled';
create index messages_bounded_conversation_idx on public.conversation_messages (organisation_id, conversation_id, created_at desc, id);
create index audit_bounded_resource_idx on public.audit_log (organisation_id, resource_type, created_at desc, id);

create function public.consume_magic_response_token(requested_token_digest text)
returns table (token_id uuid, organisation_id uuid, purpose text, subject_resource_type text, subject_resource_id uuid, guardian_id uuid)
language plpgsql security definer set search_path = '' as $$
declare consumed public.magic_response_tokens%rowtype;
begin
  if requested_token_digest !~ '^[0-9a-f]{64}$' then return; end if;
  update public.magic_response_tokens token
  set consumed_at = now()
  where token.token_digest = requested_token_digest
    and token.purpose <> 'availability'
    and token.consumed_at is null and token.revoked_at is null and token.expires_at > now()
  returning token.* into consumed;
  if not found then return; end if;
  return query select consumed.id, consumed.organisation_id, consumed.purpose, consumed.subject_resource_type, consumed.subject_resource_id, consumed.guardian_id;
end; $$;

create function public.issue_magic_availability_token(
  requested_organisation_id uuid,
  requested_event_instance_id uuid,
  requested_guardian_id uuid,
  requested_player_id uuid,
  requested_token_digest text,
  requested_expires_at timestamptz
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare event_team_id uuid; created_token_id uuid;
begin
  if requested_token_digest !~ '^[0-9a-f]{64}$' or requested_expires_at <= now() then
    raise exception 'invalid availability token' using errcode='22023';
  end if;
  select instance.team_id into event_team_id from public.event_instances instance
  where instance.id=requested_event_instance_id and instance.organisation_id=requested_organisation_id
    and instance.status='scheduled' and (instance.response_deadline is null or instance.response_deadline>now());
  if event_team_id is null or not exists (
    select 1 from public.player_guardians link
    join public.team_memberships member on member.organisation_id=link.organisation_id
      and member.player_id=link.player_id and member.team_id=event_team_id and member.status='active'
    where link.organisation_id=requested_organisation_id and link.guardian_id=requested_guardian_id and link.player_id=requested_player_id
  ) then raise exception 'availability token scope is unavailable' using errcode='22023'; end if;
  insert into public.magic_response_tokens (organisation_id,token_digest,purpose,subject_resource_type,subject_resource_id,guardian_id,player_id,expires_at)
  values (requested_organisation_id,requested_token_digest,'availability','event-instance',requested_event_instance_id,requested_guardian_id,requested_player_id,requested_expires_at)
  returning id into created_token_id;
  return created_token_id;
end; $$;

create function public.list_magic_availability_scopes(requested_organisation_id uuid, requested_event_instance_id uuid)
returns table (event_instance_id uuid,guardian_id uuid,player_id uuid,guardian_name text,player_name text,event_title text)
language sql security definer set search_path = '' stable as $$
  select instance.id,guardian.id,player.id,guardian.display_name,btrim(player.first_name||' '||player.last_name),event.title
  from public.event_instances instance
  join public.events event on event.id=instance.event_id and event.organisation_id=instance.organisation_id
  join public.team_memberships member on member.organisation_id=instance.organisation_id and member.team_id=instance.team_id and member.member_kind='player' and member.status='active'
  join public.players player on player.id=member.player_id and player.organisation_id=member.organisation_id
  join public.player_guardians link on link.organisation_id=player.organisation_id and link.player_id=player.id
  join public.guardians guardian on guardian.id=link.guardian_id and guardian.organisation_id=link.organisation_id and guardian.status='active'
  where instance.organisation_id=requested_organisation_id and instance.id=requested_event_instance_id and instance.status='scheduled'
    and (instance.response_deadline is null or instance.response_deadline>now())
    and public.can_access_team(instance.organisation_id,instance.team_id,'availability:manage')
  order by player.last_name,player.first_name,guardian.display_name limit 500;
$$;

create function public.get_magic_availability_context(requested_token_digest text)
returns table (organisation_name text,event_title text,player_name text,starts_at timestamptz,ends_at timestamptz,response_deadline timestamptz,location_name text,current_status public.availability_status)
language sql security definer set search_path = '' stable as $$
  select organisation.name,event.title,btrim(player.first_name||' '||player.last_name),instance.starts_at,instance.ends_at,instance.response_deadline,instance.location_name,response.status
  from public.magic_response_tokens token
  join public.organisations organisation on organisation.id=token.organisation_id
  join public.event_instances instance on instance.id=token.subject_resource_id and instance.organisation_id=token.organisation_id
  join public.events event on event.id=instance.event_id and event.organisation_id=instance.organisation_id
  join public.players player on player.id=token.player_id and player.organisation_id=token.organisation_id
  join public.player_guardians link on link.organisation_id=token.organisation_id and link.guardian_id=token.guardian_id and link.player_id=token.player_id
  join public.team_memberships member on member.organisation_id=token.organisation_id and member.team_id=instance.team_id and member.player_id=token.player_id and member.status='active'
  left join public.availability_responses response on response.organisation_id=token.organisation_id and response.event_instance_id=instance.id and response.player_id=token.player_id
  where requested_token_digest ~ '^[0-9a-f]{64}$' and token.token_digest=requested_token_digest
    and token.purpose='availability' and token.subject_resource_type='event-instance'
    and token.consumed_at is null and token.revoked_at is null and token.expires_at>now()
    and instance.status='scheduled' and (instance.response_deadline is null or instance.response_deadline>now())
  limit 1;
$$;

create function public.submit_magic_availability_response(requested_token_digest text,requested_status public.availability_status,requested_note text default null,requested_transport_seats smallint default null)
returns table (event_title text,player_name text,recorded_status public.availability_status)
language plpgsql security definer set search_path = '' as $$
declare response_token public.magic_response_tokens%rowtype; event_instance public.event_instances%rowtype; saved_response public.availability_responses%rowtype;
begin
  if requested_token_digest !~ '^[0-9a-f]{64}$' or (requested_note is not null and length(btrim(requested_note))>240)
    or (requested_transport_seats is not null and requested_transport_seats not between 0 and 8) then return; end if;
  select token.* into response_token from public.magic_response_tokens token
  where token.token_digest=requested_token_digest and token.purpose='availability' and token.subject_resource_type='event-instance'
    and token.consumed_at is null and token.revoked_at is null and token.expires_at>now() for update;
  if not found then return; end if;
  select instance.* into event_instance from public.event_instances instance
  where instance.id=response_token.subject_resource_id and instance.organisation_id=response_token.organisation_id
    and instance.status='scheduled' and (instance.response_deadline is null or instance.response_deadline>now()) for share;
  if not found or response_token.guardian_id is null or response_token.player_id is null or not exists (
    select 1 from public.player_guardians link
    join public.team_memberships member on member.organisation_id=link.organisation_id and member.player_id=link.player_id
      and member.team_id=event_instance.team_id and member.status='active'
    where link.organisation_id=response_token.organisation_id and link.guardian_id=response_token.guardian_id and link.player_id=response_token.player_id
  ) then return; end if;
  insert into public.availability_responses (organisation_id,event_instance_id,team_id,player_id,guardian_id,status,note,transport_seats,idempotency_key,responded_at,updated_at)
  values (response_token.organisation_id,event_instance.id,event_instance.team_id,response_token.player_id,response_token.guardian_id,requested_status,nullif(btrim(requested_note),''),requested_transport_seats,'magic:'||response_token.id::text,now(),now())
  on conflict (organisation_id,event_instance_id,player_id) do update set guardian_id=excluded.guardian_id,status=excluded.status,note=excluded.note,transport_seats=excluded.transport_seats,idempotency_key=excluded.idempotency_key,responded_at=excluded.responded_at,updated_at=excluded.updated_at
  returning * into saved_response;
  update public.magic_response_tokens token set consumed_at=now() where token.id=response_token.id;
  return query select event.title,btrim(player.first_name||' '||player.last_name),saved_response.status
  from public.events event join public.players player on player.id=response_token.player_id and player.organisation_id=response_token.organisation_id
  where event.id=event_instance.event_id and event.organisation_id=response_token.organisation_id;
end; $$;

create function public.consume_rate_limit(requested_bucket_digest text, requested_limit integer, requested_window_seconds integer)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare window_start timestamptz; current_count integer;
begin
  if requested_bucket_digest !~ '^[0-9a-f]{64}$' or requested_limit not between 1 and 10000 or requested_window_seconds not between 1 and 86400 then
    raise exception 'invalid rate limit request' using errcode='22023';
  end if;
  window_start := to_timestamp(floor(extract(epoch from now()) / requested_window_seconds) * requested_window_seconds);
  perform pg_advisory_xact_lock(hashtextextended(requested_bucket_digest || window_start::text, 0));
  insert into public.security_rate_limits (bucket_digest,window_started_at,request_count,expires_at)
  values (requested_bucket_digest,window_start,1,window_start + make_interval(secs=>requested_window_seconds))
  on conflict (bucket_digest,window_started_at) do update set request_count=public.security_rate_limits.request_count+1
  returning request_count into current_count;
  return query select current_count <= requested_limit, greatest(0,requested_limit-current_count), window_start + make_interval(secs=>requested_window_seconds);
end; $$;

create function public.request_data_correction(requested_organisation_id uuid, requested_field_key text, requested_value text, requested_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid; correction_id uuid;
begin
  if requested_field_key not in ('display_name','guardian_email')
    or (requested_field_key='display_name' and length(btrim(requested_value)) not between 2 and 120)
    or (requested_field_key='guardian_email' and lower(btrim(requested_value)) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
    or length(btrim(requested_reason)) not between 5 and 500 then
    raise exception 'invalid correction request' using errcode='22023';
  end if;
  select id into actor_id from public.memberships where organisation_id=requested_organisation_id and user_id=auth.uid() and status='active';
  if actor_id is null then raise exception 'active membership required' using errcode='42501'; end if;
  insert into public.data_correction_requests (organisation_id,requester_membership_id,subject_user_id,field_key,proposed_value,reason)
  values (requested_organisation_id,actor_id,auth.uid(),requested_field_key,btrim(requested_value),btrim(requested_reason)) returning id into correction_id;
  insert into public.audit_log (organisation_id,actor_membership_id,action,resource_type,resource_id,metadata)
  values (requested_organisation_id,actor_id,'privacy.correction-requested','data-correction',correction_id,jsonb_build_object('field_key',requested_field_key));
  return correction_id;
end; $$;

create function public.cancel_data_correction(requested_correction_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.data_correction_requests
  set status='cancelled',cancelled_at=now()
  where id=requested_correction_id and subject_user_id=auth.uid() and status='pending';
  return found;
end; $$;

create function public.decide_data_correction(requested_correction_id uuid, requested_decision text, requested_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare correction public.data_correction_requests%rowtype; actor_id uuid;
begin
  if requested_decision not in ('approve','reject') or length(btrim(requested_reason)) not between 5 and 500 then
    raise exception 'invalid correction decision' using errcode='22023';
  end if;
  select * into correction from public.data_correction_requests where id=requested_correction_id and status='pending' for update;
  if not found then return false; end if;
  select id into actor_id from public.memberships where organisation_id=correction.organisation_id and user_id=auth.uid() and status='active';
  if actor_id is null or not public.has_capability(correction.organisation_id,'club:manage','organisation',correction.organisation_id,null) then
    raise exception 'correction review access denied' using errcode='42501';
  end if;
  if requested_decision='approve' and correction.field_key='display_name' then
    update public.profiles set display_name=btrim(correction.proposed_value),updated_at=now() where id=correction.subject_user_id;
  elsif requested_decision='approve' and correction.field_key='guardian_email' then
    update public.guardians set email=lower(btrim(correction.proposed_value)),updated_at=now()
    where organisation_id=correction.organisation_id and membership_id=correction.requester_membership_id;
    if not found then raise exception 'linked guardian record not found' using errcode='P0002'; end if;
  end if;
  update public.data_correction_requests set status=case when requested_decision='approve' then 'applied' else 'rejected' end,
    decided_by_membership_id=actor_id,decision_reason=btrim(requested_reason),decided_at=now() where id=correction.id;
  insert into public.audit_log (organisation_id,actor_membership_id,action,resource_type,resource_id,metadata)
  values (correction.organisation_id,actor_id,'privacy.correction-'||requested_decision,'data-correction',correction.id,jsonb_build_object('field_key',correction.field_key));
  return true;
end; $$;

create function public.create_private_upload_intent(requested_organisation_id uuid, requested_storage_path text, requested_original_filename text, requested_declared_mime text, requested_declared_size bigint)
returns table (intent_id uuid, expires_at timestamptz) language plpgsql security definer set search_path = '' as $$
declare actor_id uuid; created public.private_upload_intents%rowtype;
begin
  select id into actor_id from public.memberships where organisation_id=requested_organisation_id and user_id=auth.uid() and status='active';
  if actor_id is null or not public.has_capability(requested_organisation_id,'documents:manage','organisation',requested_organisation_id,null) then raise exception 'document upload access denied' using errcode='42501'; end if;
  insert into public.private_upload_intents (organisation_id,actor_membership_id,storage_path,original_filename,declared_mime,declared_size)
  values (requested_organisation_id,actor_id,requested_storage_path,requested_original_filename,requested_declared_mime,requested_declared_size)
  returning * into created;
  return query select created.id,created.expires_at;
end; $$;

create function public.mark_private_upload_quarantined(requested_intent_id uuid, requested_checksum_sha256 text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.private_upload_intents set status='quarantined',checksum_sha256=requested_checksum_sha256,uploaded_at=now()
  where id=requested_intent_id and status='awaiting-upload' and expires_at>now() and requested_checksum_sha256 ~ '^[0-9a-f]{64}$';
  return found;
end; $$;

create function public.record_private_upload_scan(requested_intent_id uuid, requested_clean boolean, requested_scanner_reference text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if length(btrim(requested_scanner_reference)) not between 2 and 200 then raise exception 'scanner reference required' using errcode='22023'; end if;
  update public.private_upload_intents set status=case when requested_clean then 'clean' else 'rejected' end,scanner_reference=btrim(requested_scanner_reference),scanned_at=now()
  where id=requested_intent_id and status in ('quarantined','scanning') and checksum_sha256 is not null;
  return found;
end; $$;

create function public.reject_private_upload_intent(requested_intent_id uuid, requested_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if length(btrim(requested_reason)) not between 2 and 200 then raise exception 'rejection reason required' using errcode='22023'; end if;
  update public.private_upload_intents set status='rejected',scanner_reference=btrim(requested_reason),scanned_at=now()
  where id=requested_intent_id and status in ('awaiting-upload','quarantined','scanning');
  return found;
end; $$;

create function public.expire_stale_private_upload_intents(requested_organisation_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  if current_user not in ('postgres','service_role','supabase_admin') then raise exception 'service role required' using errcode='42501'; end if;
  update public.private_upload_intents set status='expired' where organisation_id=requested_organisation_id and status in ('awaiting-upload','quarantined','scanning') and expires_at<=now();
  get diagnostics affected=row_count;
  return affected;
end; $$;

alter table public.private_upload_intents drop constraint private_upload_intents_status_check;
alter table public.private_upload_intents add constraint private_upload_intents_status_check
  check (status in ('awaiting-upload','quarantined','scanning','clean','rejected','expired','promoted'));
alter table public.private_upload_intents drop constraint private_upload_intents_storage_path_check;
alter table public.private_upload_intents add constraint private_upload_intents_storage_path_check
  check ((status='promoted' and storage_path like organisation_id::text||'/documents/%') or (status<>'promoted' and storage_path like organisation_id::text||'/quarantine/%'));

create function public.register_promoted_private_document(requested_intent_id uuid, requested_title text, requested_storage_path text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare intent public.private_upload_intents%rowtype; document_id uuid;
begin
  select * into intent from public.private_upload_intents where id=requested_intent_id and status='clean' for update;
  if not found or intent.checksum_sha256 is null or length(btrim(requested_title)) not between 2 and 160
    or requested_storage_path not like intent.organisation_id::text||'/documents/'||intent.id::text||'/%' then
    raise exception 'clean upload promotion is invalid' using errcode='22023';
  end if;
  insert into public.club_documents (organisation_id,title,required_capability,current_version)
  values (intent.organisation_id,btrim(requested_title),'documents:manage',1) returning id into document_id;
  insert into public.club_document_versions (organisation_id,document_id,version,storage_path,checksum,created_by_membership_id)
  values (intent.organisation_id,document_id,1,btrim(requested_storage_path),intent.checksum_sha256,intent.actor_membership_id);
  insert into public.stored_files (organisation_id,storage_path,content_type,byte_size,checksum_sha256,classification,uploaded_by_membership_id)
  values (intent.organisation_id,btrim(requested_storage_path),intent.declared_mime,intent.declared_size,intent.checksum_sha256,'confidential',intent.actor_membership_id);
  update public.private_upload_intents set status='promoted',storage_path=btrim(requested_storage_path) where id=intent.id;
  insert into public.audit_log (organisation_id,actor_membership_id,action,resource_type,resource_id,metadata)
  values (intent.organisation_id,intent.actor_membership_id,'document.promoted','club-document',document_id,jsonb_build_object('upload_intent_id',intent.id));
  return document_id;
end; $$;

create function public.revoke_current_session(requested_session_digest text, requested_expires_at timestamptz, requested_reason_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare revocation_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if requested_session_digest !~ '^[0-9a-f]{64}$' or requested_expires_at <= now() or requested_reason_code !~ '^[a-z0-9][a-z0-9._-]{1,79}$' then
    raise exception 'invalid session revocation' using errcode='22023';
  end if;
  insert into public.session_revocations (user_id,session_digest,reason_code,expires_at,created_by_user_id)
  values (auth.uid(),requested_session_digest,requested_reason_code,requested_expires_at,auth.uid())
  on conflict (session_digest) do update set reason_code=excluded.reason_code,expires_at=greatest(public.session_revocations.expires_at,excluded.expires_at),revoked_at=now()
  returning id into revocation_id;
  return revocation_id;
end; $$;

create function public.cancel_account_deletion()
returns boolean language plpgsql security definer set search_path = '' as $$
declare deletion_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  select id into deletion_id from public.account_deletion_requests where user_id=auth.uid() and status='scheduled' for update;
  if deletion_id is null then return false; end if;
  update public.account_deletion_requests set status='cancelled' where id=deletion_id;
  delete from public.background_jobs where resource_id=deletion_id and kind='account-deletion' and status in ('queued','failed');
  return true;
end; $$;

create function public.release_expired_account_deletion_holds()
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer := 0; held record;
begin
  if current_user not in ('postgres','service_role','supabase_admin') then raise exception 'service role required' using errcode='42501'; end if;
  for held in select request.id,request.reviewed_by_membership_id,membership.organisation_id
    from public.account_deletion_requests request join public.memberships membership on membership.id=request.reviewed_by_membership_id
    where request.status='retention-hold' and request.legal_hold_until<=now() for update of request skip locked
  loop
    insert into public.audit_log (organisation_id,actor_membership_id,action,resource_type,resource_id,metadata)
    values (held.organisation_id,held.reviewed_by_membership_id,'privacy.account-deletion-hold-expired','account-deletion',held.id,'{}'::jsonb);
    update public.account_deletion_requests set status='scheduled',legal_hold_until=null,legal_hold_reason=null,reviewed_by_membership_id=null where id=held.id;
    update public.background_jobs set status='queued',attempt_count=0,available_at=now(),leased_at=null,last_error_code=null,completed_at=null
    where kind='account-deletion' and resource_id=held.id and status in ('failed','complete');
    affected:=affected+1;
  end loop;
  return affected;
end; $$;

alter table public.account_deletion_requests
  add column legal_hold_until timestamptz,
  add column legal_hold_reason text,
  add column reviewed_by_membership_id uuid references public.memberships(id) on delete set null;

alter table public.account_deletion_requests add constraint account_deletion_reviewed_hold
  check ((status='retention-hold') = (legal_hold_until is not null and legal_hold_reason is not null and reviewed_by_membership_id is not null));

create function public.review_account_deletion_hold(requested_organisation_id uuid, requested_user_id uuid, requested_hold_until timestamptz, requested_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor_id uuid; request_id uuid;
begin
  select id into actor_id from public.memberships where organisation_id=requested_organisation_id and user_id=auth.uid() and status='active';
  if actor_id is null or not public.has_capability(requested_organisation_id,'safeguarding:manage','organisation',requested_organisation_id,null) then
    raise exception 'retention hold review access denied' using errcode='42501';
  end if;
  if requested_hold_until <= now() or length(btrim(requested_reason)) not between 10 and 500 then raise exception 'invalid reviewed hold' using errcode='22023'; end if;
  update public.account_deletion_requests set status='retention-hold',legal_hold_until=requested_hold_until,
    legal_hold_reason=btrim(requested_reason),reviewed_by_membership_id=actor_id
  where user_id=requested_user_id and status='scheduled'
    and exists (select 1 from public.memberships where organisation_id=requested_organisation_id and user_id=requested_user_id)
  returning id into request_id;
  if request_id is null then return false; end if;
  insert into public.audit_log (organisation_id,actor_membership_id,action,resource_type,resource_id,metadata)
  values (requested_organisation_id,actor_id,'privacy.account-deletion-hold-reviewed','account-deletion',request_id,jsonb_build_object('hold_until',requested_hold_until));
  return true;
end; $$;

create or replace function public.run_retention_sweep(requested_organisation_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare removed integer := 0; affected integer;
begin
  if current_user not in ('postgres','service_role','supabase_admin') then raise exception 'service role required' using errcode='42501'; end if;
  delete from public.communication_deliveries delivery using public.retention_policies policy
  where policy.organisation_id=requested_organisation_id and policy.active and policy.resource_type='communication-delivery'
    and delivery.organisation_id=policy.organisation_id and delivery.created_at < now()-make_interval(days=>policy.retain_days);
  get diagnostics affected=row_count; removed:=removed+affected;
  delete from public.sensitive_access_log access_log using public.retention_policies policy
  where policy.organisation_id=requested_organisation_id and policy.active and policy.resource_type='sensitive-access-log'
    and access_log.organisation_id=policy.organisation_id and access_log.occurred_at < now()-make_interval(days=>policy.retain_days);
  get diagnostics affected=row_count; removed:=removed+affected;
  delete from public.data_correction_requests correction using public.retention_policies policy
  where policy.organisation_id=requested_organisation_id and policy.active and policy.resource_type='data-correction-request'
    and correction.organisation_id=policy.organisation_id and correction.status<>'pending' and correction.requested_at < now()-make_interval(days=>policy.retain_days);
  get diagnostics affected=row_count; removed:=removed+affected;
  delete from public.magic_response_tokens where organisation_id=requested_organisation_id and expires_at < now()-interval '7 days';
  get diagnostics affected=row_count; removed:=removed+affected;
  delete from public.security_rate_limits where expires_at < now();
  get diagnostics affected=row_count; removed:=removed+affected;
  delete from public.session_revocations where expires_at < now();
  get diagnostics affected=row_count; removed:=removed+affected;
  return removed;
end; $$;

create or replace function public.enqueue_due_retention_jobs()
returns integer language plpgsql security definer set search_path='' as $$
declare queued integer;
begin
  if current_user not in ('postgres','service_role','supabase_admin') then raise exception 'service role required' using errcode='42501'; end if;
  insert into public.background_jobs (organisation_id,kind,resource_id,idempotency_key)
  select organisation.id,'retention',organisation.id,'retention:'||organisation.id||':'||current_date
  from public.organisations organisation
  where exists (select 1 from public.retention_policies policy where policy.organisation_id=organisation.id and policy.active)
    or exists (select 1 from public.private_upload_intents upload where upload.organisation_id=organisation.id and ((upload.status in ('awaiting-upload','quarantined','scanning') and upload.expires_at<=now()) or (upload.status in ('rejected','expired') and upload.created_at<now()-interval '30 days')))
  on conflict (idempotency_key) do nothing;
  get diagnostics queued=row_count;
  return queued;
end; $$;

alter table public.magic_response_tokens enable row level security;
alter table public.private_upload_intents enable row level security;
alter table public.data_correction_requests enable row level security;
alter table public.session_revocations enable row level security;
alter table public.security_rate_limits enable row level security;

create policy upload_intents_read on public.private_upload_intents for select to authenticated
using (public.has_capability(organisation_id,'documents:manage','organisation',organisation_id,null));
create policy corrections_own_read on public.data_correction_requests for select to authenticated using (subject_user_id=auth.uid());
create policy corrections_admin_read on public.data_correction_requests for select to authenticated using (public.has_capability(organisation_id,'club:manage','organisation',organisation_id,null));
create policy session_revocations_own_read on public.session_revocations for select to authenticated using (user_id=auth.uid());

revoke all on table public.magic_response_tokens, public.private_upload_intents, public.data_correction_requests, public.session_revocations, public.security_rate_limits from authenticated;
revoke insert,update,delete on table public.club_documents, public.club_document_versions from authenticated;
revoke all on function public.create_club_document(uuid,text,text,text) from authenticated;
grant select on public.private_upload_intents to authenticated;
grant select on public.data_correction_requests, public.session_revocations to authenticated;
revoke all on function public.consume_magic_response_token(text), public.issue_magic_availability_token(uuid,uuid,uuid,uuid,text,timestamptz), public.list_magic_availability_scopes(uuid,uuid), public.get_magic_availability_context(text), public.submit_magic_availability_response(text,public.availability_status,text,smallint), public.consume_rate_limit(text,integer,integer), public.request_data_correction(uuid,text,text,text), public.cancel_data_correction(uuid), public.decide_data_correction(uuid,text,text), public.revoke_current_session(text,timestamptz,text), public.cancel_account_deletion(), public.release_expired_account_deletion_holds(), public.review_account_deletion_hold(uuid,uuid,timestamptz,text), public.create_private_upload_intent(uuid,text,text,text,bigint), public.mark_private_upload_quarantined(uuid,text), public.record_private_upload_scan(uuid,boolean,text), public.reject_private_upload_intent(uuid,text), public.expire_stale_private_upload_intents(uuid), public.register_promoted_private_document(uuid,text,text) from public;
revoke all on function public.consume_magic_response_token(text), public.issue_magic_availability_token(uuid,uuid,uuid,uuid,text,timestamptz), public.get_magic_availability_context(text), public.submit_magic_availability_response(text,public.availability_status,text,smallint), public.consume_rate_limit(text,integer,integer), public.release_expired_account_deletion_holds(), public.mark_private_upload_quarantined(uuid,text), public.record_private_upload_scan(uuid,boolean,text), public.reject_private_upload_intent(uuid,text), public.expire_stale_private_upload_intents(uuid), public.register_promoted_private_document(uuid,text,text) from authenticated;
grant execute on function public.consume_magic_response_token(text) to service_role;
grant execute on function public.issue_magic_availability_token(uuid,uuid,uuid,uuid,text,timestamptz), public.get_magic_availability_context(text), public.submit_magic_availability_response(text,public.availability_status,text,smallint) to service_role;
grant execute on function public.list_magic_availability_scopes(uuid,uuid) to authenticated;
grant execute on function public.consume_rate_limit(text,integer,integer) to service_role;
grant execute on function public.request_data_correction(uuid,text,text,text) to authenticated;
grant execute on function public.cancel_data_correction(uuid), public.decide_data_correction(uuid,text,text), public.review_account_deletion_hold(uuid,uuid,timestamptz,text) to authenticated;
grant execute on function public.revoke_current_session(text,timestamptz,text) to authenticated;
grant execute on function public.cancel_account_deletion() to authenticated;
grant execute on function public.create_private_upload_intent(uuid,text,text,text,bigint) to authenticated;
grant execute on function public.mark_private_upload_quarantined(uuid,text), public.record_private_upload_scan(uuid,boolean,text), public.reject_private_upload_intent(uuid,text), public.expire_stale_private_upload_intents(uuid), public.release_expired_account_deletion_holds() to service_role;
grant execute on function public.register_promoted_private_document(uuid,text,text) to service_role;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('grassroots-private-quarantine','grassroots-private-quarantine',false,10485760,array['image/png','image/jpeg','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('grassroots-private-files','grassroots-private-files',false,10485760,array['image/png','image/jpeg','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

update storage.buckets set file_size_limit=52428800,public=false,allowed_mime_types=array['application/json'] where id='grassroots-private-exports';

-- Published announcements create channel-specific delivery jobs from each adult's preferences.
-- Provider workers resolve message bodies at send time; delivery rows remain metadata-only.
create or replace function public.enqueue_published_announcement_deliveries()
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
    select new.organisation_id,audience.membership_id,'announcement',new.id,channel.name,
      case channel.name when 'email' then 'resend' when 'push' then 'push-adapter' else 'internal' end,
      'pending','announcement:'||new.id||':'||channel.name||':'||audience.membership_id
    from (
      select membership.id as membership_id from public.memberships membership where new.team_id is null and membership.organisation_id=new.organisation_id and membership.status='active'
      union select team_audience.membership_id from public.team_audience_members(new.organisation_id,new.team_id) team_audience where new.team_id is not null
    ) audience
    left join public.communication_preferences preference on preference.organisation_id=new.organisation_id and preference.membership_id=audience.membership_id
    cross join lateral (values ('in-app'),('email'),('push')) channel(name)
    where channel.name='in-app'
      or (channel.name='email' and coalesce(preference.email_enabled,true))
      or (channel.name='push' and coalesce(preference.push_enabled,false) and exists (
        select 1 from public.push_subscriptions subscription where subscription.organisation_id=new.organisation_id and subscription.membership_id=audience.membership_id and subscription.revoked_at is null
      ))
    on conflict (organisation_id,idempotency_key) do nothing;
  end if;
  return new;
end; $$;
