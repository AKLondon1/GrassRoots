-- Communications, member finance and platform billing are deliberately separate domains.

insert into public.permissions (key, description) values
  ('messages:manage', 'Moderate adult group conversations'),
  ('notifications:manage', 'Manage personal communication preferences'),
  ('payments:view', 'View linked household payments'),
  ('payments:manage', 'Manage club member invoices and transactions'),
  ('forms:manage', 'Manage club forms'),
  ('consents:respond', 'Respond to consent for a linked child'),
  ('consents:manage', 'Manage consent definitions and reporting'),
  ('compliance:manage', 'Manage workforce compliance'),
  ('safeguarding:view', 'Access restricted safeguarding workflows'),
  ('club:manage', 'Manage organisation lifecycle settings'),
  ('integrations:manage', 'Manage organisation provider integrations'),
  ('entitlements:view', 'View organisation entitlements'),
  ('platform:view', 'View platform organisations'),
  ('plans:manage', 'Manage platform subscription plans'),
  ('features:manage', 'Manage platform feature flags'),
  ('providers:view', 'View provider usage metadata'),
  ('health:view', 'View platform service health'),
  ('access:manage', 'Review audited platform access'),
  ('analytics:view', 'View privacy-safe platform analytics')
on conflict (key) do nothing;

create function public.grant_phase5_role_permissions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.role_permissions (organisation_id, role_id, permission_id)
  select new.organisation_id, new.id, permission.id from public.permissions permission
  where
    (new.key in ('owner', 'club-admin') and permission.key in ('messages:manage','payments:manage','forms:manage','consents:manage','compliance:manage','club:manage','integrations:manage','entitlements:view'))
    or (new.key = 'treasurer' and permission.key in ('payments:manage','reports:view','audit:view'))
    or (new.key = 'welfare-officer' and permission.key in ('consents:manage','compliance:manage','safeguarding:view','reports:view','audit:view'))
    or (new.key = 'guardian' and permission.key in ('payments:view','consents:respond','notifications:manage'))
    or (new.key = 'platform-operator' and permission.key in ('platform:view','plans:manage','features:manage','providers:view','health:view','access:manage','analytics:view'))
  on conflict (organisation_id, role_id, permission_id) do nothing;
  return new;
end;
$$;

create trigger roles_grant_phase5_permissions after insert on public.roles
for each row execute function public.grant_phase5_role_permissions();

insert into public.role_permissions (organisation_id, role_id, permission_id)
select role.organisation_id, role.id, permission.id from public.roles role cross join public.permissions permission
where
  (role.key in ('owner', 'club-admin') and permission.key in ('messages:manage','payments:manage','forms:manage','consents:manage','compliance:manage','club:manage','integrations:manage','entitlements:view'))
  or (role.key = 'treasurer' and permission.key in ('payments:manage','reports:view','audit:view'))
  or (role.key = 'welfare-officer' and permission.key in ('consents:manage','compliance:manage','safeguarding:view','reports:view','audit:view'))
  or (role.key = 'guardian' and permission.key in ('payments:view','consents:respond','notifications:manage'))
  or (role.key = 'platform-operator' and permission.key in ('platform:view','plans:manage','features:manage','providers:view','health:view','access:manage','analytics:view'))
on conflict (organisation_id, role_id, permission_id) do nothing;

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid,
  authored_by_membership_id uuid not null,
  title text not null check (length(btrim(title)) between 2 and 160),
  body text not null check (length(btrim(body)) between 1 and 10000),
  status text not null default 'draft' check (status in ('draft','scheduled','published','archived')),
  scheduled_for timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (team_id, organisation_id) references public.teams(id, organisation_id) on delete cascade,
  foreign key (authored_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  check ((status = 'scheduled') = (scheduled_for is not null) or status <> 'scheduled')
);

create table public.announcement_recipients (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  announcement_id uuid not null, membership_id uuid not null, read_at timestamptz,
  created_at timestamptz not null default now(), unique (id, organisation_id), unique (organisation_id, announcement_id, membership_id),
  foreign key (announcement_id, organisation_id) references public.announcements(id, organisation_id) on delete cascade,
  foreign key (membership_id, organisation_id) references public.memberships(id, organisation_id) on delete cascade
);

create table public.group_conversations (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid, title text not null check (length(btrim(title)) between 2 and 160),
  status text not null default 'open' check (status in ('open','locked','archived')), created_at timestamptz not null default now(),
  unique (id, organisation_id), foreign key (team_id, organisation_id) references public.teams(id, organisation_id) on delete cascade
);

create table public.conversation_participants (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  conversation_id uuid not null, membership_id uuid not null, joined_at timestamptz not null default now(), left_at timestamptz,
  unique (id, organisation_id), unique (organisation_id, conversation_id, membership_id),
  foreign key (conversation_id, organisation_id) references public.group_conversations(id, organisation_id) on delete cascade,
  foreign key (membership_id, organisation_id) references public.memberships(id, organisation_id) on delete cascade
);
comment on table public.conversation_participants is 'Authenticated adults only. Child/player ids are never conversation participants.';

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  conversation_id uuid not null, author_membership_id uuid not null, body text not null check (length(btrim(body)) between 1 and 2000),
  moderation_state text not null default 'visible' check (moderation_state in ('visible','hidden','removed')),
  created_at timestamptz not null default now(), edited_at timestamptz,
  unique (id, organisation_id),
  foreign key (conversation_id, organisation_id) references public.group_conversations(id, organisation_id) on delete cascade,
  foreign key (author_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict
);
comment on column public.conversation_messages.body is 'Sensitive message body must not be copied to ordinary audit, notification or analytics metadata.';

create table public.conversation_reports (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  message_id uuid not null, reported_by_membership_id uuid not null, category text not null check (category in ('conduct','privacy','safeguarding','other')),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')), resolution_note text,
  created_at timestamptz not null default now(), unique (id, organisation_id),
  unique (organisation_id, message_id, reported_by_membership_id),
  foreign key (message_id, organisation_id) references public.conversation_messages(id, organisation_id) on delete cascade,
  foreign key (reported_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict
);

create function public.list_open_conversation_reports(requested_organisation_id uuid)
returns table (report_id uuid, category text, report_status text, message_id uuid, message_body text, moderation_state text, conversation_title text, created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.has_capability(requested_organisation_id,'messages:manage','organisation',requested_organisation_id,null) then raise exception 'not authorised' using errcode='42501'; end if;
  return query select report.id,report.category,report.status,message.id,message.body,message.moderation_state,conversation.title,report.created_at
  from public.conversation_reports report join public.conversation_messages message on message.id=report.message_id and message.organisation_id=report.organisation_id
  join public.group_conversations conversation on conversation.id=message.conversation_id and conversation.organisation_id=message.organisation_id
  where report.organisation_id=requested_organisation_id and report.status in ('open','reviewing') order by report.created_at;
end; $$;

create function public.resolve_conversation_report(requested_organisation_id uuid, requested_report_id uuid, requested_status text, requested_resolution_note text, requested_moderation_state text)
returns void language plpgsql security definer set search_path='' as $$
declare actor_id uuid; target_message_id uuid;
begin
  if not public.has_capability(requested_organisation_id,'messages:manage','organisation',requested_organisation_id,null) then raise exception 'not authorised' using errcode='42501'; end if;
  if requested_status not in ('resolved','dismissed') or requested_moderation_state not in ('visible','hidden','removed') or length(btrim(requested_resolution_note))<2 then raise exception 'invalid moderation outcome'; end if;
  select id into actor_id from public.memberships where organisation_id=requested_organisation_id and user_id=auth.uid() and status='active';
  update public.conversation_reports set status=requested_status,resolution_note=requested_resolution_note
  where id=requested_report_id and organisation_id=requested_organisation_id and status in ('open','reviewing') returning message_id into target_message_id;
  if target_message_id is null then raise exception 'report unavailable'; end if;
  update public.conversation_messages set moderation_state=requested_moderation_state where id=target_message_id and organisation_id=requested_organisation_id;
  insert into public.audit_log (organisation_id,actor_membership_id,action,resource_type,resource_id,metadata)
  values (requested_organisation_id,actor_id,'conversation-report.resolved','conversation-report',requested_report_id,jsonb_build_object('report_status',requested_status,'moderation_state',requested_moderation_state));
end; $$;

create table public.communication_preferences (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  membership_id uuid not null, email_enabled boolean not null default true, push_enabled boolean not null default false,
  availability_reminders boolean not null default true, payment_receipts boolean not null default true,
  updated_at timestamptz not null default now(), unique (id, organisation_id), unique (organisation_id, membership_id),
  foreign key (membership_id, organisation_id) references public.memberships(id, organisation_id) on delete cascade
);

create table public.communication_deliveries (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  recipient_membership_id uuid not null, resource_type text not null, resource_id uuid, channel text not null check (channel in ('email','push','in-app')),
  provider text not null, provider_reference text, status text not null check (status in ('pending','processing','sent','failed','suppressed')),
  idempotency_key text not null, error_code text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, organisation_id), unique (organisation_id, idempotency_key),
  foreign key (recipient_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete cascade
);
comment on table public.communication_deliveries is 'Metadata only: message body must not be copied to delivery records.';

create function public.create_adult_conversation(requested_organisation_id uuid, requested_title text, requested_participant_membership_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor_id uuid; conversation_id uuid;
begin
  if not public.has_capability(requested_organisation_id,'messages:manage','organisation',requested_organisation_id,null) then raise exception 'not authorised' using errcode='42501'; end if;
  select id into actor_id from public.memberships where organisation_id=requested_organisation_id and user_id=auth.uid() and status='active';
  if actor_id is null or not exists (select 1 from public.memberships where id=requested_participant_membership_id and organisation_id=requested_organisation_id and status='active') then raise exception 'active adult membership required' using errcode='42501'; end if;
  insert into public.group_conversations (organisation_id,title) values (requested_organisation_id,requested_title) returning id into conversation_id;
  insert into public.conversation_participants (organisation_id,conversation_id,membership_id)
  select requested_organisation_id,conversation_id,membership_id from (values (actor_id),(requested_participant_membership_id)) participant(membership_id)
  on conflict (organisation_id,conversation_id,membership_id) do nothing;
  return conversation_id;
end; $$;

create function public.publish_announcement(requested_organisation_id uuid, requested_title text, requested_body text, requested_team_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor_id uuid; announcement_id uuid;
begin
  if not public.has_capability(requested_organisation_id,'messages:manage','organisation',requested_organisation_id,null) then raise exception 'not authorised' using errcode='42501'; end if;
  select id into actor_id from public.memberships where organisation_id=requested_organisation_id and user_id=auth.uid() and status='active';
  if actor_id is null then raise exception 'active membership required' using errcode='42501'; end if;
  insert into public.announcements (organisation_id,team_id,authored_by_membership_id,title,body,status,published_at)
  values (requested_organisation_id,requested_team_id,actor_id,requested_title,requested_body,'published',now()) returning id into announcement_id;
  return announcement_id;
end; $$;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  membership_id uuid not null, endpoint_hash text not null, encrypted_subscription jsonb not null check (jsonb_typeof(encrypted_subscription) = 'object'),
  revoked_at timestamptz, created_at timestamptz not null default now(), unique (id, organisation_id), unique (organisation_id, endpoint_hash),
  foreign key (membership_id, organisation_id) references public.memberships(id, organisation_id) on delete cascade
);

create table public.member_payment_plans (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null, currency text not null default 'GBP' check (currency = 'GBP'), instalment_count integer not null check (instalment_count between 1 and 24),
  active boolean not null default true, created_at timestamptz not null default now(), unique (id, organisation_id), unique (organisation_id, name)
);

create table public.member_invoices (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  invoice_number text not null, household_id uuid not null, payment_plan_id uuid,
  status text not null default 'draft' check (status in ('draft','issued','part-paid','paid','void','overdue')),
  currency text not null default 'GBP' check (currency = 'GBP'), subtotal_pence bigint not null default 0 check (subtotal_pence >= 0),
  discount_pence bigint not null default 0 check (discount_pence >= 0 and discount_pence <= subtotal_pence), total_pence bigint generated always as (subtotal_pence - discount_pence) stored,
  due_on date, issued_at timestamptz, paid_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, organisation_id), unique (organisation_id, invoice_number),
  foreign key (household_id, organisation_id) references public.households(id, organisation_id) on delete restrict,
  foreign key (payment_plan_id, organisation_id) references public.member_payment_plans(id, organisation_id) on delete restrict,
  check ((status in ('issued','part-paid','paid','overdue')) = (issued_at is not null) or status in ('draft','void')),
  check ((status = 'paid') = (paid_at is not null) or status <> 'paid')
);

create table public.member_invoice_lines (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  invoice_id uuid not null, description text not null, quantity integer not null check (quantity > 0), unit_amount_pence bigint not null check (unit_amount_pence >= 0),
  line_total_pence bigint generated always as (quantity * unit_amount_pence) stored, created_at timestamptz not null default now(), unique (id, organisation_id),
  foreign key (invoice_id, organisation_id) references public.member_invoices(id, organisation_id) on delete cascade
);

create table public.member_invoice_assignments (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  invoice_id uuid not null, player_id uuid not null, guardian_id uuid not null, created_at timestamptz not null default now(),
  unique (id, organisation_id), unique (organisation_id, invoice_id, player_id),
  foreign key (invoice_id, organisation_id) references public.member_invoices(id, organisation_id) on delete cascade,
  foreign key (player_id, organisation_id) references public.players(id, organisation_id) on delete restrict,
  foreign key (guardian_id, organisation_id) references public.guardians(id, organisation_id) on delete restrict
);

create function public.recalculate_member_invoice_total()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.member_invoices set subtotal_pence=subtotal_pence+new.line_total_pence where id=new.invoice_id and organisation_id=new.organisation_id;
  elsif tg_op = 'DELETE' then
    update public.member_invoices set subtotal_pence=subtotal_pence-old.line_total_pence where id=old.invoice_id and organisation_id=old.organisation_id;
  else
    if new.invoice_id <> old.invoice_id or new.organisation_id <> old.organisation_id then raise exception 'invoice lines cannot move between invoices' using errcode='23514'; end if;
    update public.member_invoices set subtotal_pence=subtotal_pence-old.line_total_pence+new.line_total_pence where id=new.invoice_id and organisation_id=new.organisation_id;
  end if;
  return coalesce(new,old);
end; $$;
create trigger invoice_lines_recalculate after insert or update or delete on public.member_invoice_lines
for each row execute function public.recalculate_member_invoice_total();

create function public.validate_invoice_assignment_guardian()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.player_guardians pg join public.member_invoices invoice on invoice.id = new.invoice_id and invoice.organisation_id = new.organisation_id and invoice.household_id = pg.household_id
    join public.guardian_permissions permission on permission.player_guardian_id = pg.id and permission.organisation_id = pg.organisation_id and permission.payments
    where pg.organisation_id = new.organisation_id and pg.player_id = new.player_id and pg.guardian_id = new.guardian_id
  )
  then raise exception 'invoice guardian must be linked to player' using errcode = '23514'; end if;
  return new;
end; $$;
create trigger invoice_assignment_guardian before insert or update on public.member_invoice_assignments
for each row execute function public.validate_invoice_assignment_guardian();

create table public.member_discounts (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  code text not null, kind text not null check (kind in ('fixed','percentage')), value integer not null check (value >= 0),
  active boolean not null default true, created_at timestamptz not null default now(), unique (id, organisation_id), unique (organisation_id, code),
  check ((kind = 'percentage' and value <= 100) or kind = 'fixed')
);

create table public.member_transactions (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  invoice_id uuid not null, amount_pence bigint not null check (amount_pence > 0), currency text not null default 'GBP' check (currency = 'GBP'),
  provider text not null check (provider in ('stripe','manual-development','cash','bank-transfer')),
  provider_reference text not null, status text not null check (status in ('pending','settled','failed','cancelled')),
  recorded_by_membership_id uuid, settled_at timestamptz, created_at timestamptz not null default now(),
  unique (id, organisation_id), unique (organisation_id, provider, provider_reference),
  foreign key (invoice_id, organisation_id) references public.member_invoices(id, organisation_id) on delete restrict,
  foreign key (recorded_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  check ((status = 'settled') = (settled_at is not null) or status <> 'settled')
);

create table public.member_refunds (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  transaction_id uuid not null, amount_pence bigint not null check (amount_pence > 0), reason text not null,
  status text not null default 'requested' check (status in ('requested','processing','settled','failed','cancelled')),
  provider_reference text, requested_by_membership_id uuid not null, settled_at timestamptz, created_at timestamptz not null default now(),
  unique (id, organisation_id), unique nulls not distinct (organisation_id, provider_reference),
  foreign key (transaction_id, organisation_id) references public.member_transactions(id, organisation_id) on delete restrict,
  foreign key (requested_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict
);

create table public.cash_reconciliations (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  reconciled_by_membership_id uuid not null, expected_pence bigint not null check (expected_pence >= 0), counted_pence bigint not null check (counted_pence >= 0),
  variance_pence bigint generated always as (counted_pence - expected_pence) stored, note text, reconciled_at timestamptz not null default now(),
  unique (id, organisation_id), foreign key (reconciled_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict
);

create table public.stripe_connected_accounts (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  stripe_account_id text not null, charges_enabled boolean not null default false, payouts_enabled boolean not null default false,
  details_submitted boolean not null default false, disconnected_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, organisation_id), unique (organisation_id), unique (stripe_account_id)
);

create table public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(), stripe_event_id text not null unique, event_type text not null,
  organisation_id uuid references public.organisations(id) on delete set null, payload_sha256 text not null,
  processing_status text not null default 'received' check (processing_status in ('received','processed','ignored','failed')),
  received_at timestamptz not null default now(), processed_at timestamptz, error_code text
);
comment on table public.stripe_webhook_events is 'Stores idempotency metadata and payload hash only; raw webhook bodies are not retained.';

create table public.platform_plans (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null, monthly_price_pence bigint not null check (monthly_price_pence >= 0),
  currency text not null default 'GBP' check (currency = 'GBP'), active boolean not null default true, created_at timestamptz not null default now()
);

create table public.platform_operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.platform_operators is 'Service-managed global operator allow-list. Tenant roles cannot grant platform-wide access.';

create table public.platform_subscriptions (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  plan_id uuid not null references public.platform_plans(id) on delete restrict, status text not null check (status in ('trialing','active','past-due','cancelled')),
  founding_entitlement boolean not null default false, trial_ends_at timestamptz, current_period_ends_at timestamptz,
  provider_customer_reference text, provider_subscription_reference text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, organisation_id), unique (organisation_id)
);
comment on table public.platform_subscriptions is 'Platform billing only; never joined into member invoice settlement.';

create table public.platform_usage_records (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  metric text not null check (metric in ('email','push','ai-suggestion','storage-bytes')), quantity bigint not null check (quantity >= 0),
  period_start date not null, period_end date not null, idempotency_key text not null, recorded_at timestamptz not null default now(),
  unique (organisation_id, idempotency_key), check (period_start <= period_end)
);
comment on table public.platform_usage_records is 'Aggregate counts only; no message body, medical, welfare or child-content metadata.';

insert into public.platform_plans (code,name,monthly_price_pence,currency)
values ('trial','Fourteen-day trial',0,'GBP')
on conflict (code) do nothing;

create function public.is_platform_operator()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_operators operator where operator.user_id=auth.uid() and operator.active);
$$;

create function public.team_audience_members(requested_organisation_id uuid, requested_team_id uuid)
returns table (membership_id uuid) language sql stable security definer set search_path='' as $$
  select distinct audience.membership_id from (
    select coach.membership_id from public.team_memberships team_member join public.coaches coach on coach.id=team_member.coach_id and coach.organisation_id=team_member.organisation_id and coach.status='active'
    where team_member.organisation_id=requested_organisation_id and team_member.team_id=requested_team_id and team_member.status='active'
    union
    select volunteer.membership_id from public.team_memberships team_member join public.volunteers volunteer on volunteer.id=team_member.volunteer_id and volunteer.organisation_id=team_member.organisation_id and volunteer.status='active'
    where team_member.organisation_id=requested_organisation_id and team_member.team_id=requested_team_id and team_member.status='active'
    union
    select guardian.membership_id from public.team_memberships team_member
    join public.player_guardians link on link.player_id=team_member.player_id and link.organisation_id=team_member.organisation_id
    join public.guardian_permissions permission on permission.player_guardian_id=link.id and permission.organisation_id=link.organisation_id and permission.communication
    join public.guardians guardian on guardian.id=link.guardian_id and guardian.organisation_id=link.organisation_id and guardian.status='active'
    where team_member.organisation_id=requested_organisation_id and team_member.team_id=requested_team_id and team_member.status='active'
  ) audience join public.memberships membership on membership.id=audience.membership_id and membership.organisation_id=requested_organisation_id and membership.status='active';
$$;

create function public.is_team_audience(requested_organisation_id uuid, requested_team_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (select 1 from public.team_audience_members(requested_organisation_id,requested_team_id) audience join public.memberships membership on membership.id=audience.membership_id where membership.user_id=auth.uid());
$$;

create function public.save_platform_plan(requested_plan_id uuid, requested_code text, requested_name text, requested_monthly_price_pence bigint)
returns uuid language plpgsql security definer set search_path='' as $$
declare saved_id uuid;
begin
  if not public.is_platform_operator() then raise exception 'platform operator required' using errcode='42501'; end if;
  if requested_code !~ '^[a-z0-9-]{2,40}$' or length(btrim(requested_name))<2 or requested_monthly_price_pence<0 then raise exception 'invalid platform plan'; end if;
  insert into public.platform_plans (id,code,name,monthly_price_pence,currency,active)
  values (coalesce(requested_plan_id,gen_random_uuid()),requested_code,requested_name,requested_monthly_price_pence,'GBP',true)
  on conflict (id) do update set code=excluded.code,name=excluded.name,monthly_price_pence=excluded.monthly_price_pence
  returning id into saved_id;
  return saved_id;
end; $$;

create function public.save_platform_feature_flag(requested_flag_id uuid, requested_key text, requested_description text, requested_owner text, requested_enabled_by_default boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare saved_id uuid;
begin
  if not public.is_platform_operator() then raise exception 'platform operator required' using errcode='42501'; end if;
  if requested_key !~ '^[a-z0-9.-]{2,80}$' or length(btrim(requested_description))<2 or length(btrim(requested_owner))<2 then raise exception 'invalid feature flag'; end if;
  insert into public.platform_feature_flags (id,key,description,enabled_by_default,owner)
  values (coalesce(requested_flag_id,gen_random_uuid()),requested_key,requested_description,requested_enabled_by_default,requested_owner)
  on conflict (id) do update set key=excluded.key,description=excluded.description,enabled_by_default=excluded.enabled_by_default,owner=excluded.owner
  returning id into saved_id;
  return saved_id;
end; $$;

create function public.process_stripe_webhook_event(
  requested_event_id text, requested_event_type text, requested_organisation_id uuid, requested_payload_sha256 text,
  requested_invoice_id uuid default null, requested_amount_pence bigint default null, requested_currency text default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare inserted_count integer; outstanding_pence bigint;
begin
  if current_user not in ('postgres','service_role','supabase_admin') then raise exception 'service role required' using errcode = '42501'; end if;
  insert into public.stripe_webhook_events (stripe_event_id,event_type,organisation_id,payload_sha256)
  values (requested_event_id,requested_event_type,requested_organisation_id,requested_payload_sha256)
  on conflict (stripe_event_id) do update
    set processing_status='received',processed_at=null,error_code=null
    where stripe_webhook_events.processing_status='failed'
      and stripe_webhook_events.event_type=excluded.event_type
      and stripe_webhook_events.organisation_id=excluded.organisation_id
      and stripe_webhook_events.payload_sha256=excluded.payload_sha256;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then return false; end if;
  begin
    if requested_event_type = 'payment_intent.succeeded' then
      if requested_invoice_id is null or requested_amount_pence is null or requested_amount_pence <= 0 or lower(requested_currency) is distinct from 'gbp' then raise exception 'invalid GBP payment event'; end if;
      select invoice.total_pence - coalesce((select sum(transaction.amount_pence) from public.member_transactions transaction where transaction.invoice_id=invoice.id and transaction.organisation_id=invoice.organisation_id and transaction.status='settled'),0)
      into outstanding_pence from public.member_invoices invoice where invoice.id=requested_invoice_id and invoice.organisation_id=requested_organisation_id for update;
      if outstanding_pence is null or requested_amount_pence > outstanding_pence then raise exception 'payment exceeds invoice outstanding balance'; end if;
      insert into public.member_transactions (organisation_id,invoice_id,amount_pence,provider,provider_reference,status,settled_at)
      values (requested_organisation_id,requested_invoice_id,requested_amount_pence,'stripe',requested_event_id,'settled',now());
      update public.member_invoices set status=case when requested_amount_pence=outstanding_pence then 'paid' else 'part-paid' end, paid_at=case when requested_amount_pence=outstanding_pence then now() else null end where id=requested_invoice_id and organisation_id=requested_organisation_id;
    end if;
    update public.stripe_webhook_events set processing_status = 'processed', processed_at = now() where stripe_event_id = requested_event_id;
  exception when others then
    update public.stripe_webhook_events set processing_status = 'failed', error_code = sqlstate where stripe_event_id = requested_event_id;
    return false;
  end;
  return true;
end; $$;

create function public.request_member_refund(requested_organisation_id uuid, requested_transaction_id uuid, requested_amount_pence bigint, requested_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid; paid_pence bigint; refunded_pence bigint; refund_id uuid;
begin
  if not public.has_capability(requested_organisation_id,'payments:manage','organisation',requested_organisation_id,null) then raise exception 'not authorised' using errcode = '42501'; end if;
  select id into actor_id from public.memberships where organisation_id = requested_organisation_id and user_id = auth.uid() and status = 'active';
  perform pg_advisory_xact_lock(hashtextextended(requested_transaction_id::text,0));
  select amount_pence into paid_pence from public.member_transactions where id = requested_transaction_id and organisation_id = requested_organisation_id and status = 'settled' for update;
  select coalesce(sum(amount_pence),0) into refunded_pence from public.member_refunds where transaction_id = requested_transaction_id and organisation_id = requested_organisation_id and status in ('requested','processing','settled');
  if paid_pence is null or requested_amount_pence <= 0 or refunded_pence + requested_amount_pence > paid_pence then raise exception 'refund exceeds refundable balance'; end if;
  insert into public.member_refunds (organisation_id,transaction_id,amount_pence,reason,requested_by_membership_id)
  values (requested_organisation_id,requested_transaction_id,requested_amount_pence,requested_reason,actor_id) returning id into refund_id;
  insert into public.audit_log (organisation_id,actor_membership_id,action,resource_type,resource_id,metadata)
  values (requested_organisation_id,actor_id,'member-refund.requested','member-refund',refund_id,jsonb_build_object('amount_pence',requested_amount_pence));
  return refund_id;
end; $$;

create function public.record_manual_member_payment(requested_organisation_id uuid, requested_invoice_id uuid, requested_amount_pence bigint, requested_reference text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid; transaction_id uuid; outstanding_pence bigint;
begin
  if not public.has_capability(requested_organisation_id,'payments:manage','organisation',requested_organisation_id,null) then raise exception 'not authorised' using errcode = '42501'; end if;
  if requested_amount_pence <= 0 then raise exception 'payment must be positive'; end if;
  select id into actor_id from public.memberships where organisation_id = requested_organisation_id and user_id = auth.uid() and status = 'active';
  perform pg_advisory_xact_lock(hashtextextended(requested_invoice_id::text,0));
  select invoice.total_pence - coalesce((select sum(transaction.amount_pence) from public.member_transactions transaction where transaction.invoice_id=invoice.id and transaction.organisation_id=invoice.organisation_id and transaction.status='settled'),0)
  into outstanding_pence from public.member_invoices invoice where invoice.id=requested_invoice_id and invoice.organisation_id=requested_organisation_id for update;
  if outstanding_pence is null or requested_amount_pence > outstanding_pence then raise exception 'payment exceeds invoice outstanding balance'; end if;
  insert into public.member_transactions (organisation_id,invoice_id,amount_pence,provider,provider_reference,status,recorded_by_membership_id,settled_at)
  values (requested_organisation_id,requested_invoice_id,requested_amount_pence,'manual-development',requested_reference,'settled',actor_id,now()) returning id into transaction_id;
  update public.member_invoices set status=case when requested_amount_pence=outstanding_pence then 'paid' else 'part-paid' end, paid_at=case when requested_amount_pence=outstanding_pence then now() else null end where id=requested_invoice_id and organisation_id=requested_organisation_id;
  insert into public.audit_log (organisation_id,actor_membership_id,action,resource_type,resource_id,metadata)
  values (requested_organisation_id,actor_id,'member-payment.recorded','member-transaction',transaction_id,jsonb_build_object('amount_pence',requested_amount_pence,'provider','manual-development'));
  return transaction_id;
end; $$;

create function public.create_member_invoice(
  requested_organisation_id uuid, requested_invoice_number text, requested_household_id uuid,
  requested_player_id uuid, requested_guardian_id uuid, requested_description text,
  requested_amount_pence bigint, requested_due_on date
) returns uuid language plpgsql security definer set search_path='' as $$
declare invoice_id uuid; actor_id uuid;
begin
  if not public.has_capability(requested_organisation_id,'payments:manage','organisation',requested_organisation_id,null) then raise exception 'not authorised' using errcode='42501'; end if;
  if length(btrim(requested_invoice_number))<2 or length(btrim(requested_description))<2 or requested_amount_pence<=0 then raise exception 'invalid invoice'; end if;
  select id into actor_id from public.memberships where organisation_id=requested_organisation_id and user_id=auth.uid() and status='active';
  insert into public.member_invoices (organisation_id,invoice_number,household_id,status,subtotal_pence,discount_pence,due_on)
  values (requested_organisation_id,requested_invoice_number,requested_household_id,'draft',0,0,requested_due_on) returning id into invoice_id;
  insert into public.member_invoice_lines (organisation_id,invoice_id,description,quantity,unit_amount_pence)
  values (requested_organisation_id,invoice_id,requested_description,1,requested_amount_pence);
  insert into public.member_invoice_assignments (organisation_id,invoice_id,player_id,guardian_id)
  values (requested_organisation_id,invoice_id,requested_player_id,requested_guardian_id);
  update public.member_invoices set status='issued',issued_at=now() where id=invoice_id and organisation_id=requested_organisation_id;
  insert into public.audit_log (organisation_id,actor_membership_id,action,resource_type,resource_id,metadata)
  values (requested_organisation_id,actor_id,'member-invoice.issued','member-invoice',invoice_id,jsonb_build_object('amount_pence',requested_amount_pence));
  return invoice_id;
end; $$;

create function public.record_cash_reconciliation(requested_organisation_id uuid, requested_expected_pence bigint, requested_counted_pence bigint, requested_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor_id uuid; reconciliation_id uuid;
begin
  if not public.has_capability(requested_organisation_id,'payments:manage','organisation',requested_organisation_id,null) then raise exception 'not authorised' using errcode='42501'; end if;
  if requested_expected_pence<0 or requested_counted_pence<0 then raise exception 'cash totals cannot be negative'; end if;
  select id into actor_id from public.memberships where organisation_id=requested_organisation_id and user_id=auth.uid() and status='active';
  insert into public.cash_reconciliations (organisation_id,reconciled_by_membership_id,expected_pence,counted_pence,note)
  values (requested_organisation_id,actor_id,requested_expected_pence,requested_counted_pence,nullif(btrim(requested_note),'')) returning id into reconciliation_id;
  return reconciliation_id;
end; $$;

create index announcements_team_idx on public.announcements (organisation_id, team_id, published_at desc);
create index announcement_recipients_member_idx on public.announcement_recipients (organisation_id, membership_id, read_at);
create index messages_conversation_idx on public.conversation_messages (organisation_id, conversation_id, created_at);
create index delivery_pending_idx on public.communication_deliveries (organisation_id, status, created_at) where status in ('pending','failed');
create index invoices_household_idx on public.member_invoices (organisation_id, household_id, status, due_on);
create index invoice_assignments_guardian_idx on public.member_invoice_assignments (organisation_id, guardian_id, invoice_id);
create index transactions_invoice_idx on public.member_transactions (organisation_id, invoice_id, status);
create index refunds_transaction_idx on public.member_refunds (organisation_id, transaction_id, status);
create index usage_period_idx on public.platform_usage_records (organisation_id, period_start, metric);

alter table public.announcements enable row level security;
alter table public.announcement_recipients enable row level security;
alter table public.group_conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.conversation_reports enable row level security;
alter table public.communication_preferences enable row level security;
alter table public.communication_deliveries enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.member_payment_plans enable row level security;
alter table public.member_invoices enable row level security;
alter table public.member_invoice_lines enable row level security;
alter table public.member_invoice_assignments enable row level security;
alter table public.member_discounts enable row level security;
alter table public.member_transactions enable row level security;
alter table public.member_refunds enable row level security;
alter table public.cash_reconciliations enable row level security;
alter table public.stripe_connected_accounts enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.platform_plans enable row level security;
alter table public.platform_operators enable row level security;
alter table public.platform_subscriptions enable row level security;
alter table public.platform_usage_records enable row level security;

create policy announcements_read on public.announcements for select to authenticated using (public.has_capability(organisation_id,'messages:manage','organisation',organisation_id,null) or (status='published' and public.has_active_membership(organisation_id) and (team_id is null or public.is_team_audience(organisation_id,team_id))));
create policy announcements_manage on public.announcements for all to authenticated using (public.has_capability(organisation_id,'announcements:manage','organisation',organisation_id,null) or public.has_capability(organisation_id,'messages:manage','organisation',organisation_id,null)) with check (public.has_capability(organisation_id,'announcements:manage','organisation',organisation_id,null) or public.has_capability(organisation_id,'messages:manage','organisation',organisation_id,null));
create policy announcement_recipients_own on public.announcement_recipients for select to authenticated using (exists (select 1 from public.memberships m where m.id = membership_id and m.organisation_id = organisation_id and m.user_id = auth.uid() and m.status = 'active'));
create policy conversations_participant on public.group_conversations for select to authenticated using (exists (select 1 from public.conversation_participants cp join public.memberships m on m.id = cp.membership_id and m.organisation_id = cp.organisation_id where cp.conversation_id = group_conversations.id and cp.organisation_id = group_conversations.organisation_id and cp.left_at is null and m.user_id = auth.uid() and m.status = 'active'));
create policy conversations_manage on public.group_conversations for all to authenticated using (public.has_capability(organisation_id,'messages:manage','organisation',organisation_id,null)) with check (public.has_capability(organisation_id,'messages:manage','organisation',organisation_id,null));
create policy participants_own_conversations on public.conversation_participants for select to authenticated using (exists (select 1 from public.memberships m where m.id = membership_id and m.organisation_id = organisation_id and m.user_id = auth.uid() and m.status = 'active') or public.has_capability(organisation_id,'messages:manage','organisation',organisation_id,null));
create policy participants_manage on public.conversation_participants for all to authenticated using (public.has_capability(organisation_id,'messages:manage','organisation',organisation_id,null)) with check (public.has_capability(organisation_id,'messages:manage','organisation',organisation_id,null));
create policy messages_participant on public.conversation_messages for select to authenticated using (moderation_state='visible' and exists (select 1 from public.conversation_participants cp join public.memberships m on m.id = cp.membership_id and m.organisation_id = cp.organisation_id where cp.conversation_id = conversation_messages.conversation_id and cp.organisation_id = conversation_messages.organisation_id and cp.left_at is null and m.user_id = auth.uid() and m.status = 'active'));
create policy messages_send on public.conversation_messages for insert to authenticated with check (exists (select 1 from public.conversation_participants cp join public.memberships m on m.id=cp.membership_id and m.organisation_id=cp.organisation_id join public.group_conversations conversation on conversation.id=cp.conversation_id and conversation.organisation_id=cp.organisation_id and conversation.status='open' where cp.conversation_id=conversation_messages.conversation_id and cp.organisation_id=conversation_messages.organisation_id and cp.membership_id=conversation_messages.author_membership_id and cp.left_at is null and m.user_id=auth.uid() and m.status='active'));
create policy message_reports_member on public.conversation_reports for insert to authenticated with check (exists (select 1 from public.memberships m join public.conversation_messages message on message.id=conversation_reports.message_id and message.organisation_id=conversation_reports.organisation_id and message.moderation_state='visible' join public.conversation_participants participant on participant.conversation_id=message.conversation_id and participant.organisation_id=message.organisation_id and participant.membership_id=m.id and participant.left_at is null where m.id = conversation_reports.reported_by_membership_id and m.organisation_id = conversation_reports.organisation_id and m.user_id = auth.uid() and m.status = 'active'));
create policy message_reports_manage on public.conversation_reports for select to authenticated using (public.has_capability(organisation_id,'messages:manage','organisation',organisation_id,null));
create policy preferences_own on public.communication_preferences for all to authenticated using (exists (select 1 from public.memberships m where m.id = membership_id and m.organisation_id = organisation_id and m.user_id = auth.uid() and m.status = 'active')) with check (exists (select 1 from public.memberships m where m.id = membership_id and m.organisation_id = organisation_id and m.user_id = auth.uid() and m.status = 'active'));
create policy push_own on public.push_subscriptions for all to authenticated using (exists (select 1 from public.memberships m where m.id = membership_id and m.organisation_id = organisation_id and m.user_id = auth.uid() and m.status = 'active')) with check (exists (select 1 from public.memberships m where m.id = membership_id and m.organisation_id = organisation_id and m.user_id = auth.uid() and m.status = 'active'));
create policy deliveries_own on public.communication_deliveries for select to authenticated using (exists (select 1 from public.memberships m where m.id = recipient_membership_id and m.organisation_id = organisation_id and m.user_id = auth.uid() and m.status = 'active'));
create policy invoices_manage on public.member_invoices for select to authenticated using (public.has_capability(organisation_id,'payments:manage','organisation',organisation_id,null) or exists (select 1 from public.member_invoice_assignments assignment join public.guardians guardian on guardian.id=assignment.guardian_id and guardian.organisation_id=assignment.organisation_id and guardian.status='active' join public.memberships membership on membership.id=guardian.membership_id and membership.organisation_id=guardian.organisation_id and membership.status='active' join public.player_guardians link on link.organisation_id=assignment.organisation_id and link.player_id=assignment.player_id and link.guardian_id=assignment.guardian_id join public.guardian_permissions permission on permission.organisation_id=link.organisation_id and permission.player_guardian_id=link.id and permission.payments where assignment.invoice_id=member_invoices.id and assignment.organisation_id=member_invoices.organisation_id and membership.user_id=auth.uid()));
create policy finance_plans_manage on public.member_payment_plans for all to authenticated using (public.has_capability(organisation_id,'payments:manage','organisation',organisation_id,null)) with check (public.has_capability(organisation_id,'payments:manage','organisation',organisation_id,null));
create policy finance_lines_read on public.member_invoice_lines for select to authenticated using (exists (select 1 from public.member_invoices i where i.id = member_invoice_lines.invoice_id and i.organisation_id = member_invoice_lines.organisation_id));
create policy finance_assignments_read on public.member_invoice_assignments for select to authenticated using (public.has_capability(organisation_id,'payments:manage','organisation',organisation_id,null) or exists (select 1 from public.guardians guardian join public.memberships membership on membership.id=guardian.membership_id and membership.organisation_id=guardian.organisation_id and membership.status='active' join public.player_guardians link on link.organisation_id=member_invoice_assignments.organisation_id and link.player_id=member_invoice_assignments.player_id and link.guardian_id=guardian.id join public.guardian_permissions permission on permission.organisation_id=link.organisation_id and permission.player_guardian_id=link.id and permission.payments where guardian.id=member_invoice_assignments.guardian_id and guardian.organisation_id=member_invoice_assignments.organisation_id and guardian.status='active' and membership.user_id=auth.uid()));
create policy finance_transactions_read on public.member_transactions for select to authenticated using (public.has_capability(organisation_id,'payments:manage','organisation',organisation_id,null) or exists (select 1 from public.member_invoices i where i.id = member_transactions.invoice_id and i.organisation_id = member_transactions.organisation_id));
create policy finance_admin_read on public.member_refunds for select to authenticated using (public.has_capability(organisation_id,'payments:manage','organisation',organisation_id,null));
create policy cash_admin_read on public.cash_reconciliations for select to authenticated using (public.has_capability(organisation_id,'payments:manage','organisation',organisation_id,null));
create policy discounts_admin on public.member_discounts for all to authenticated using (public.has_capability(organisation_id,'payments:manage','organisation',organisation_id,null)) with check (public.has_capability(organisation_id,'payments:manage','organisation',organisation_id,null));
create policy stripe_account_admin on public.stripe_connected_accounts for select to authenticated using (public.has_capability(organisation_id,'integrations:manage','organisation',organisation_id,null));
create policy platform_subscription_tenant_read on public.platform_subscriptions for select to authenticated using (public.has_capability(organisation_id,'entitlements:view','organisation',organisation_id,null));
create policy platform_plans_operator_read on public.platform_plans for select to authenticated using (public.is_platform_operator());
create policy platform_subscriptions_operator_read on public.platform_subscriptions for select to authenticated using (public.is_platform_operator());
create policy platform_usage_operator_read on public.platform_usage_records for select to authenticated using (public.is_platform_operator());

revoke all on function public.process_stripe_webhook_event(text,text,uuid,text,uuid,bigint,text) from public;
revoke all on function public.record_manual_member_payment(uuid,uuid,bigint,text) from public;
revoke all on function public.request_member_refund(uuid,uuid,bigint,text) from public;
revoke all on function public.create_member_invoice(uuid,text,uuid,uuid,uuid,text,bigint,date) from public;
revoke all on function public.record_cash_reconciliation(uuid,bigint,bigint,text) from public;
revoke all on function public.create_adult_conversation(uuid,text,uuid) from public;
revoke all on function public.publish_announcement(uuid,text,text,uuid) from public;
revoke all on function public.is_platform_operator() from public;
revoke all on function public.team_audience_members(uuid,uuid), public.is_team_audience(uuid,uuid), public.list_open_conversation_reports(uuid), public.resolve_conversation_report(uuid,uuid,text,text,text) from public;
revoke all on function public.save_platform_plan(uuid,text,text,bigint) from public;
revoke all on function public.save_platform_feature_flag(uuid,text,text,text,boolean) from public;
grant execute on function public.process_stripe_webhook_event(text,text,uuid,text,uuid,bigint,text) to service_role;
grant execute on function public.record_manual_member_payment(uuid,uuid,bigint,text) to authenticated;
grant execute on function public.request_member_refund(uuid,uuid,bigint,text) to authenticated;
grant execute on function public.create_member_invoice(uuid,text,uuid,uuid,uuid,text,bigint,date) to authenticated;
grant execute on function public.record_cash_reconciliation(uuid,bigint,bigint,text) to authenticated;
grant execute on function public.create_adult_conversation(uuid,text,uuid) to authenticated;
grant execute on function public.publish_announcement(uuid,text,text,uuid) to authenticated;
grant execute on function public.is_platform_operator() to authenticated;
grant execute on function public.is_team_audience(uuid,uuid), public.list_open_conversation_reports(uuid), public.resolve_conversation_report(uuid,uuid,text,text,text) to authenticated;
grant execute on function public.save_platform_plan(uuid,text,text,bigint) to authenticated;
grant execute on function public.save_platform_feature_flag(uuid,text,text,text,boolean) to authenticated;

revoke all on table public.announcements, public.announcement_recipients, public.group_conversations, public.conversation_participants,
 public.conversation_messages, public.conversation_reports, public.communication_preferences, public.communication_deliveries,
 public.push_subscriptions, public.member_payment_plans, public.member_invoices, public.member_invoice_lines,
 public.member_invoice_assignments, public.member_discounts, public.member_transactions, public.member_refunds,
 public.cash_reconciliations, public.stripe_connected_accounts, public.stripe_webhook_events, public.platform_plans,
 public.platform_operators, public.platform_subscriptions, public.platform_usage_records from authenticated;
grant select, insert, update on public.announcement_recipients, public.group_conversations, public.conversation_participants,
 public.conversation_messages, public.communication_preferences, public.push_subscriptions to authenticated;
grant select on public.announcements to authenticated;
grant select, insert on public.conversation_reports to authenticated;
grant select on public.communication_deliveries, public.member_invoices, public.member_invoice_lines, public.member_invoice_assignments,
 public.member_transactions, public.member_refunds, public.cash_reconciliations, public.stripe_connected_accounts, public.platform_subscriptions to authenticated;
grant select on public.platform_plans, public.platform_usage_records to authenticated;
grant select, insert, update, delete on public.member_payment_plans, public.member_discounts to authenticated;

create trigger announcements_set_updated_at before update on public.announcements for each row execute function public.set_updated_at();
create trigger communication_preferences_set_updated_at before update on public.communication_preferences for each row execute function public.set_updated_at();
create trigger communication_deliveries_set_updated_at before update on public.communication_deliveries for each row execute function public.set_updated_at();
create trigger member_invoices_set_updated_at before update on public.member_invoices for each row execute function public.set_updated_at();
create trigger stripe_connected_accounts_set_updated_at before update on public.stripe_connected_accounts for each row execute function public.set_updated_at();
create trigger platform_subscriptions_set_updated_at before update on public.platform_subscriptions for each row execute function public.set_updated_at();
