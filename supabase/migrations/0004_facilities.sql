create extension if not exists btree_gist;

insert into public.permissions (key, description)
values
  ('venues:manage', 'Manage club venues and facilities'),
  ('pitches:manage', 'Allocate and relocate pitch bookings'),
  ('pitches:inspect', 'Record inspections and closures'),
  ('facilities:manage', 'Manage maintenance and facility assets'),
  ('documents:manage', 'Manage versioned club documents'),
  ('equipment:manage', 'Manage kit and equipment reservations'),
  ('reports:view', 'View and export permitted operational reports'),
  ('audit:view', 'View the organisation audit trail'),
  ('support:request', 'Create a platform support request'),
  ('support:manage', 'Manage time-limited platform support access'),
  ('volunteers:manage', 'Manage the volunteer rota')
on conflict (key) do nothing;

create function public.grant_phase3_role_permissions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.role_permissions (organisation_id, role_id, permission_id)
  select new.organisation_id, new.id, permission.id
  from public.permissions permission
  where
    (new.key in ('owner', 'club-admin') and permission.key in (
      'venues:manage', 'pitches:manage', 'pitches:inspect', 'facilities:manage',
      'documents:manage', 'equipment:manage', 'reports:view', 'audit:view',
      'support:request', 'volunteers:manage'
    ))
    or (new.key = 'pitch-admin' and permission.key in (
      'venues:manage', 'pitches:manage', 'pitches:inspect', 'facilities:manage', 'reports:view', 'audit:view'
    ))
    or (new.key = 'facilities-admin' and permission.key in (
      'venues:manage', 'pitches:manage', 'pitches:inspect', 'facilities:manage',
      'equipment:manage', 'reports:view', 'audit:view'
    ))
    or (new.key = 'fixture-secretary' and permission.key in (
      'venues:manage', 'pitches:manage', 'reports:view', 'support:request'
    ))
    or (new.key in ('coach', 'manager') and permission.key in ('reports:view'))
    or (new.key = 'platform-operator' and permission.key in ('support:manage'))
  on conflict (organisation_id, role_id, permission_id) do nothing;
  return new;
end;
$$;

create trigger roles_grant_phase3_permissions
after insert on public.roles for each row execute function public.grant_phase3_role_permissions();

insert into public.role_permissions (organisation_id, role_id, permission_id)
select role.organisation_id, role.id, permission.id
from public.roles role cross join public.permissions permission
where
  (role.key in ('owner', 'club-admin') and permission.key in (
    'venues:manage', 'pitches:manage', 'pitches:inspect', 'facilities:manage',
    'documents:manage', 'equipment:manage', 'reports:view', 'audit:view',
    'support:request', 'volunteers:manage'
  ))
  or (role.key = 'pitch-admin' and permission.key in (
    'venues:manage', 'pitches:manage', 'pitches:inspect', 'facilities:manage', 'reports:view', 'audit:view'
  ))
  or (role.key = 'facilities-admin' and permission.key in (
    'venues:manage', 'pitches:manage', 'pitches:inspect', 'facilities:manage',
    'equipment:manage', 'reports:view', 'audit:view'
  ))
  or (role.key = 'fixture-secretary' and permission.key in (
    'venues:manage', 'pitches:manage', 'reports:view', 'support:request'
  ))
  or (role.key in ('coach', 'manager') and permission.key = 'reports:view')
  or (role.key = 'platform-operator' and permission.key = 'support:manage')
on conflict (organisation_id, role_id, permission_id) do nothing;

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 120),
  address text not null default '',
  time_zone text not null default 'Europe/London',
  step_free_access boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organisation_id)
);

create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  venue_id uuid not null,
  name text not null check (length(btrim(name)) between 2 and 120),
  kind text not null check (kind in ('pitch', 'training-area', 'clubhouse', 'changing-room', 'car-park', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (venue_id, organisation_id) references public.venues(id, organisation_id) on delete cascade
);

create table public.reservation_units (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  facility_id uuid not null,
  parent_unit_id uuid,
  name text not null check (length(btrim(name)) between 1 and 120),
  capacity integer not null check (capacity > 0),
  accessible boolean not null default false,
  floodlit boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organisation_id),
  unique (id, organisation_id, facility_id),
  foreign key (facility_id, organisation_id) references public.facilities(id, organisation_id) on delete cascade,
  foreign key (parent_unit_id, organisation_id, facility_id) references public.reservation_units(id, organisation_id, facility_id) on delete restrict,
  check (parent_unit_id is null or parent_unit_id <> id)
);

create table public.reservation_unit_exclusions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  reservation_unit_id uuid not null,
  excluded_unit_id uuid not null,
  reason text not null check (length(btrim(reason)) between 2 and 240),
  created_at timestamptz not null default now(),
  unique (id, organisation_id),
  unique (organisation_id, reservation_unit_id, excluded_unit_id),
  foreign key (reservation_unit_id, organisation_id) references public.reservation_units(id, organisation_id) on delete cascade,
  foreign key (excluded_unit_id, organisation_id) references public.reservation_units(id, organisation_id) on delete cascade,
  check (reservation_unit_id <> excluded_unit_id)
);

create function public.validate_reservation_unit_parent()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.parent_unit_id is null then return new; end if;
  if exists (
    with recursive ancestors(id, parent_unit_id, path) as (
      select unit.id, unit.parent_unit_id, array[unit.id]
      from public.reservation_units unit
      where unit.organisation_id = new.organisation_id and unit.facility_id = new.facility_id and unit.id = new.parent_unit_id
      union all
      select parent.id, parent.parent_unit_id, ancestors.path || parent.id
      from public.reservation_units parent join ancestors on ancestors.parent_unit_id = parent.id
      where parent.organisation_id = new.organisation_id and parent.facility_id = new.facility_id
        and not parent.id = any(ancestors.path)
    ) select 1 from ancestors where id = new.id
  ) then raise exception 'reservation-unit hierarchy cannot contain a cycle' using errcode = '23514'; end if;
  return new;
end;
$$;

create trigger reservation_units_validate_parent
before insert or update of parent_unit_id, facility_id on public.reservation_units
for each row execute function public.validate_reservation_unit_parent();

create table public.facility_bookings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  reservation_unit_id uuid not null,
  event_instance_id uuid,
  title text not null check (length(btrim(title)) between 2 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  buffer_before_minutes integer not null default 0 check (buffer_before_minutes between 0 and 240),
  buffer_after_minutes integer not null default 0 check (buffer_after_minutes between 0 and 240),
  status text not null default 'confirmed' check (status in ('provisional', 'confirmed', 'cancelled')),
  external_hire_id uuid,
  created_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (reservation_unit_id, organisation_id) references public.reservation_units(id, organisation_id) on delete restrict,
  foreign key (event_instance_id, organisation_id) references public.event_instances(id, organisation_id) on delete restrict,
  foreign key (created_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  check (starts_at < ends_at),
  exclude using gist (
    organisation_id with =,
    reservation_unit_id with =,
    tstzrange(
      starts_at - make_interval(mins => buffer_before_minutes),
      ends_at + make_interval(mins => buffer_after_minutes),
      '[)'
    ) with &&
  ) where (status <> 'cancelled')
);

create table public.facility_blocks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  reservation_unit_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null check (length(btrim(reason)) between 2 and 240),
  created_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (reservation_unit_id, organisation_id) references public.reservation_units(id, organisation_id) on delete cascade,
  check (starts_at < ends_at)
);

create table public.facility_inspections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  reservation_unit_id uuid not null,
  inspected_by_membership_id uuid not null,
  inspected_at timestamptz not null,
  outcome text not null check (outcome in ('open', 'monitor', 'closed')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (reservation_unit_id, organisation_id) references public.reservation_units(id, organisation_id) on delete cascade,
  foreign key (inspected_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict
);

create table public.facility_closures (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  reservation_unit_id uuid not null,
  inspection_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null check (length(btrim(reason)) between 2 and 240),
  closed_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (reservation_unit_id, organisation_id) references public.reservation_units(id, organisation_id) on delete cascade,
  foreign key (inspection_id, organisation_id) references public.facility_inspections(id, organisation_id) on delete restrict,
  foreign key (closed_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  check (starts_at < ends_at)
);

create table public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  facility_id uuid not null,
  title text not null check (length(btrim(title)) between 2 and 160),
  description text not null default '',
  priority text not null check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'planned', 'in-progress', 'complete', 'cancelled')),
  assigned_membership_id uuid,
  due_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (facility_id, organisation_id) references public.facilities(id, organisation_id) on delete cascade,
  foreign key (assigned_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict
);

create table public.facility_assets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  facility_id uuid not null,
  name text not null,
  asset_tag text not null,
  condition text not null check (condition in ('good', 'monitor', 'repair', 'retired')),
  created_at timestamptz not null default now(),
  unique (id, organisation_id),
  unique (organisation_id, asset_tag),
  foreign key (facility_id, organisation_id) references public.facilities(id, organisation_id) on delete cascade
);

create table public.external_hires (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  venue_id uuid not null,
  supplier_name text not null,
  reference text not null,
  cost_pence integer not null check (cost_pence >= 0),
  status text not null check (status in ('draft', 'requested', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (venue_id, organisation_id) references public.venues(id, organisation_id) on delete restrict
);

alter table public.facility_bookings add constraint facility_bookings_external_hire_fk
  foreign key (external_hire_id, organisation_id) references public.external_hires(id, organisation_id) on delete restrict;

create table public.club_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  title text not null,
  required_capability text not null default 'documents:manage',
  current_version integer not null default 1 check (current_version > 0),
  created_at timestamptz not null default now(),
  unique (id, organisation_id)
);

create table public.club_document_versions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  document_id uuid not null,
  version integer not null check (version > 0),
  storage_path text not null,
  checksum text not null,
  created_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  unique (id, organisation_id),
  unique (organisation_id, document_id, version),
  foreign key (document_id, organisation_id) references public.club_documents(id, organisation_id) on delete cascade,
  foreign key (created_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict
);

create table public.equipment_items (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  quantity integer not null check (quantity >= 0),
  asset_tag text,
  created_at timestamptz not null default now(),
  unique (id, organisation_id),
  unique nulls not distinct (organisation_id, asset_tag)
);

create table public.equipment_reservations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  equipment_item_id uuid not null,
  event_id uuid,
  quantity integer not null check (quantity > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (equipment_item_id, organisation_id) references public.equipment_items(id, organisation_id) on delete cascade,
  foreign key (event_id, organisation_id) references public.events(id, organisation_id) on delete restrict,
  check (starts_at < ends_at)
);

create table public.volunteer_shifts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_id uuid,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  required_people integer not null default 1 check (required_people > 0),
  created_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (event_id, organisation_id) references public.events(id, organisation_id) on delete cascade,
  check (starts_at < ends_at)
);

create table public.volunteer_shift_assignments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  shift_id uuid not null,
  membership_id uuid not null,
  status text not null check (status in ('offered', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (id, organisation_id),
  unique (organisation_id, shift_id, membership_id),
  foreign key (shift_id, organisation_id) references public.volunteer_shifts(id, organisation_id) on delete cascade,
  foreign key (membership_id, organisation_id) references public.memberships(id, organisation_id) on delete cascade
);

create table public.export_audit (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  actor_membership_id uuid not null,
  format text not null check (format in ('csv', 'pdf')),
  resource_type text not null,
  watermark text not null,
  row_count integer not null check (row_count >= 0),
  created_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (actor_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict
);

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  requested_by_membership_id uuid not null,
  subject text not null,
  description text not null,
  authorised_resources jsonb not null default '[]'::jsonb check (jsonb_typeof(authorised_resources) = 'array'),
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (requested_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict
);

create table public.support_sessions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  support_request_id uuid not null,
  operator_membership_id uuid not null,
  reason text not null check (length(btrim(reason)) between 10 and 500),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  allowed_resources text[] not null default array[]::text[],
  allowed_resource_ids uuid[] not null default array[]::uuid[],
  revoked_at timestamptz,
  revoked_by_user_id uuid references auth.users(id) on delete restrict,
  revocation_reason text,
  created_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (support_request_id, organisation_id) references public.support_requests(id, organisation_id) on delete cascade,
  foreign key (operator_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  check (expires_at > starts_at and expires_at <= starts_at + interval '60 minutes'),
  check (allowed_resources <@ array['venue', 'facility', 'facility_booking', 'event']::text[]),
  check (cardinality(allowed_resources) = cardinality(allowed_resource_ids)),
  check ((revoked_at is null and revoked_by_user_id is null) or (revoked_at is not null and revoked_by_user_id is not null and length(btrim(revocation_reason)) >= 5))
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  actor_membership_id uuid,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (actor_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict
);

create table public.facility_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_instance_id uuid not null,
  team_id uuid not null,
  kind text not null check (kind in ('facility-relocated', 'event-cancelled')),
  urgency text not null default 'urgent' check (urgency = 'urgent'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  idempotency_key text not null,
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'processing', 'sent', 'failed')),
  leased_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  unique (id, organisation_id),
  unique (organisation_id, idempotency_key),
  foreign key (event_instance_id, organisation_id, team_id) references public.event_instances(id, organisation_id, team_id) on delete cascade
);

create index facilities_venue_idx on public.facilities (organisation_id, venue_id);
create index reservation_units_facility_idx on public.reservation_units (organisation_id, facility_id, parent_unit_id);
create index facility_bookings_calendar_idx on public.facility_bookings (organisation_id, starts_at, ends_at) where status <> 'cancelled';
create unique index facility_bookings_active_event_idx on public.facility_bookings (organisation_id, event_instance_id) where event_instance_id is not null and status <> 'cancelled';
create index facility_blocks_calendar_idx on public.facility_blocks (organisation_id, reservation_unit_id, starts_at);
create index facility_closures_calendar_idx on public.facility_closures (organisation_id, reservation_unit_id, starts_at);
create index maintenance_open_idx on public.maintenance_requests (organisation_id, priority, due_on) where status not in ('complete', 'cancelled');
create index documents_search_idx on public.club_documents using gin (to_tsvector('english', title));
create index support_sessions_active_idx on public.support_sessions (organisation_id, expires_at) where revoked_at is null;
create index audit_log_resource_idx on public.audit_log (organisation_id, resource_type, resource_id, created_at desc);
create index facility_outbox_pending_idx on public.facility_notification_outbox (organisation_id, created_at) where delivery_status = 'pending';
create index unit_exclusions_reverse_idx on public.reservation_unit_exclusions (organisation_id, excluded_unit_id, reservation_unit_id);
create index inspections_unit_idx on public.facility_inspections (organisation_id, reservation_unit_id, inspected_at desc);
create index maintenance_facility_idx on public.maintenance_requests (organisation_id, facility_id, status);
create index facility_assets_facility_idx on public.facility_assets (organisation_id, facility_id);
create index external_hires_venue_idx on public.external_hires (organisation_id, venue_id, status);
create index document_versions_document_idx on public.club_document_versions (organisation_id, document_id, version desc);
create index equipment_reservations_item_idx on public.equipment_reservations (organisation_id, equipment_item_id, starts_at, ends_at);
create index volunteer_assignments_shift_idx on public.volunteer_shift_assignments (organisation_id, shift_id, status);
create index support_requests_requester_idx on public.support_requests (organisation_id, requested_by_membership_id, status);

create function public.reservation_units_conflict(
  requested_organisation_id uuid,
  left_unit_id uuid,
  right_unit_id uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  with recursive left_ancestors(id, parent_unit_id) as (
    select unit.id, unit.parent_unit_id from public.reservation_units unit
    where unit.organisation_id = requested_organisation_id and unit.id = left_unit_id
    union all
    select parent.id, parent.parent_unit_id from public.reservation_units parent
    join left_ancestors child on child.parent_unit_id = parent.id
    where parent.organisation_id = requested_organisation_id
  ), right_ancestors(id, parent_unit_id) as (
    select unit.id, unit.parent_unit_id from public.reservation_units unit
    where unit.organisation_id = requested_organisation_id and unit.id = right_unit_id
    union all
    select parent.id, parent.parent_unit_id from public.reservation_units parent
    join right_ancestors child on child.parent_unit_id = parent.id
    where parent.organisation_id = requested_organisation_id
  )
  select left_unit_id = right_unit_id
    or exists (select 1 from left_ancestors where id = right_unit_id)
    or exists (select 1 from right_ancestors where id = left_unit_id)
    or exists (
      select 1 from public.reservation_unit_exclusions exclusion
      where exclusion.organisation_id = requested_organisation_id
        and ((exclusion.reservation_unit_id = left_unit_id and exclusion.excluded_unit_id = right_unit_id)
          or (exclusion.reservation_unit_id = right_unit_id and exclusion.excluded_unit_id = left_unit_id))
    );
$$;

create function public.allocate_facility_booking(
  requested_organisation_id uuid,
  requested_unit_id uuid,
  requested_event_instance_id uuid,
  requested_title text,
  requested_starts_at timestamptz,
  requested_ends_at timestamptz,
  requested_buffer_before integer default 0,
  requested_buffer_after integer default 0
) returns public.facility_bookings language plpgsql security definer set search_path = '' as $$
declare actor_membership_id uuid; created_booking public.facility_bookings; linked_instance record;
begin
  if not public.has_capability(requested_organisation_id, 'pitches:manage', 'organisation', requested_organisation_id, null) then
    raise exception 'facility access denied' using errcode = '42501';
  end if;
  select membership.id into actor_membership_id from public.memberships membership
  where membership.organisation_id = requested_organisation_id and membership.user_id = auth.uid() and membership.status = 'active';
  if actor_membership_id is null then raise exception 'active membership required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_organisation_id::text, 0));
  if requested_event_instance_id is not null then
    select instance.starts_at, instance.ends_at, event.title into linked_instance
    from public.event_instances instance join public.events event on event.id = instance.event_id and event.organisation_id = instance.organisation_id
    where instance.id = requested_event_instance_id and instance.organisation_id = requested_organisation_id and instance.status = 'scheduled' for update of instance;
    if not found then raise exception 'scheduled event instance not found'; end if;
    if exists (select 1 from public.facility_bookings booking where booking.organisation_id = requested_organisation_id and booking.event_instance_id = requested_event_instance_id and booking.status <> 'cancelled') then raise exception 'event instance is already allocated'; end if;
    requested_title := linked_instance.title;
    requested_starts_at := linked_instance.starts_at;
    requested_ends_at := linked_instance.ends_at;
  end if;
  if requested_starts_at >= requested_ends_at then raise exception 'booking start must precede end'; end if;
  if not exists (select 1 from public.reservation_units unit where unit.id = requested_unit_id and unit.organisation_id = requested_organisation_id and unit.active) then raise exception 'reservation unit is not active'; end if;
  if exists (
    select 1 from public.facility_bookings booking
    where booking.organisation_id = requested_organisation_id and booking.status <> 'cancelled'
      and public.reservation_units_conflict(requested_organisation_id, booking.reservation_unit_id, requested_unit_id)
      and tstzrange(booking.starts_at - make_interval(mins => booking.buffer_before_minutes), booking.ends_at + make_interval(mins => booking.buffer_after_minutes), '[)')
        && tstzrange(requested_starts_at - make_interval(mins => requested_buffer_before), requested_ends_at + make_interval(mins => requested_buffer_after), '[)')
  ) or exists (
    select 1 from public.facility_blocks block
    where block.organisation_id = requested_organisation_id
      and public.reservation_units_conflict(requested_organisation_id, block.reservation_unit_id, requested_unit_id)
      and tstzrange(block.starts_at, block.ends_at, '[)') && tstzrange(requested_starts_at - make_interval(mins => requested_buffer_before), requested_ends_at + make_interval(mins => requested_buffer_after), '[)')
  ) or exists (
    select 1 from public.facility_closures closure
    where closure.organisation_id = requested_organisation_id
      and public.reservation_units_conflict(requested_organisation_id, closure.reservation_unit_id, requested_unit_id)
      and tstzrange(closure.starts_at, closure.ends_at, '[)') && tstzrange(requested_starts_at - make_interval(mins => requested_buffer_before), requested_ends_at + make_interval(mins => requested_buffer_after), '[)')
  ) then raise exception 'facility booking conflict' using errcode = '23P01'; end if;
  insert into public.facility_bookings (organisation_id, reservation_unit_id, event_instance_id, title, starts_at, ends_at, buffer_before_minutes, buffer_after_minutes, created_by_membership_id)
  values (requested_organisation_id, requested_unit_id, requested_event_instance_id, requested_title, requested_starts_at, requested_ends_at, requested_buffer_before, requested_buffer_after, actor_membership_id)
  returning * into created_booking;
  insert into public.audit_log (organisation_id, actor_membership_id, action, resource_type, resource_id)
  values (requested_organisation_id, actor_membership_id, 'facility.booking.allocated', 'facility_booking', created_booking.id);
  return created_booking;
end;
$$;

create function public.preview_facility_closure_impacts(
  requested_organisation_id uuid,
  requested_unit_id uuid,
  requested_starts_at timestamptz,
  requested_ends_at timestamptz
) returns setof public.facility_bookings language sql stable security definer set search_path = '' as $$
  select booking.* from public.facility_bookings booking
  where booking.organisation_id = requested_organisation_id and booking.status <> 'cancelled'
    and (public.has_capability(requested_organisation_id, 'pitches:inspect', 'organisation', requested_organisation_id, null)
      or public.has_capability(requested_organisation_id, 'pitches:manage', 'organisation', requested_organisation_id, null))
    and public.reservation_units_conflict(requested_organisation_id, booking.reservation_unit_id, requested_unit_id)
    and tstzrange(booking.starts_at - make_interval(mins => booking.buffer_before_minutes), booking.ends_at + make_interval(mins => booking.buffer_after_minutes), '[)')
      && tstzrange(requested_starts_at, requested_ends_at, '[)')
  order by booking.starts_at, booking.id;
$$;

create function public.create_facility_block(
  requested_organisation_id uuid, requested_unit_id uuid, requested_starts_at timestamptz,
  requested_ends_at timestamptz, requested_reason text
) returns public.facility_blocks language plpgsql security definer set search_path = '' as $$
declare created_block public.facility_blocks;
begin
  if not public.has_capability(requested_organisation_id, 'pitches:manage', 'organisation', requested_organisation_id, null) then raise exception 'pitch access denied' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_organisation_id::text, 0));
  if exists (select 1 from public.preview_facility_closure_impacts(requested_organisation_id, requested_unit_id, requested_starts_at, requested_ends_at)) then
    raise exception 'block affects active bookings; use the closure resolution workflow' using errcode = '23P01';
  end if;
  insert into public.facility_blocks (organisation_id, reservation_unit_id, starts_at, ends_at, reason)
  values (requested_organisation_id, requested_unit_id, requested_starts_at, requested_ends_at, btrim(requested_reason)) returning * into created_block;
  return created_block;
end;
$$;

create function public.close_and_relocate_facility_bookings(
  requested_organisation_id uuid,
  requested_unit_id uuid,
  requested_starts_at timestamptz,
  requested_ends_at timestamptz,
  requested_reason text,
  replacement_units jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_membership_id uuid; closure_id uuid; inspection_id uuid; affected public.facility_bookings; target_unit_id uuid; moved jsonb := '[]'::jsonb; action_value text; instance_record record;
begin
  if not public.has_capability(requested_organisation_id, 'pitches:inspect', 'organisation', requested_organisation_id, null)
    or not public.has_capability(requested_organisation_id, 'pitches:manage', 'organisation', requested_organisation_id, null) then
    raise exception 'facility access denied' using errcode = '42501';
  end if;
  if length(btrim(requested_reason)) < 2 then raise exception 'closure reason required'; end if;
  select membership.id into actor_membership_id from public.memberships membership
  where membership.organisation_id = requested_organisation_id and membership.user_id = auth.uid() and membership.status = 'active';
  if actor_membership_id is null then raise exception 'active membership required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_organisation_id::text, 0));
  insert into public.facility_inspections (organisation_id, reservation_unit_id, inspected_by_membership_id, inspected_at, outcome, notes)
  values (requested_organisation_id, requested_unit_id, actor_membership_id, now(), 'closed', btrim(requested_reason)) returning id into inspection_id;
  insert into public.facility_closures (organisation_id, reservation_unit_id, inspection_id, starts_at, ends_at, reason, closed_by_membership_id)
  values (requested_organisation_id, requested_unit_id, inspection_id, requested_starts_at, requested_ends_at, btrim(requested_reason), actor_membership_id)
  returning id into closure_id;
  for affected in select * from public.facility_bookings booking
    where booking.organisation_id = requested_organisation_id and booking.status <> 'cancelled'
      and public.reservation_units_conflict(requested_organisation_id, booking.reservation_unit_id, requested_unit_id)
      and tstzrange(booking.starts_at - make_interval(mins => booking.buffer_before_minutes), booking.ends_at + make_interval(mins => booking.buffer_after_minutes), '[)') && tstzrange(requested_starts_at, requested_ends_at, '[)')
    for update
  loop
    action_value := nullif(replacement_units ->> affected.id::text, '');
    if action_value is null then raise exception 'cancel or replacement required for booking %', affected.id; end if;
    if action_value = 'cancel' then
      update public.facility_bookings set status = 'cancelled', updated_at = now() where id = affected.id and organisation_id = requested_organisation_id;
      for instance_record in select instance.id, instance.team_id, instance.location_name from public.event_instances instance
        where instance.organisation_id = requested_organisation_id and instance.id = affected.event_instance_id
          and tstzrange(instance.starts_at, instance.ends_at, '[)') && tstzrange(affected.starts_at, affected.ends_at, '[)') for update
      loop
        update public.event_instances set status = 'cancelled', cancelled_reason = btrim(requested_reason), updated_at = now() where id = instance_record.id and organisation_id = requested_organisation_id;
        insert into public.event_change_summaries (organisation_id, event_instance_id, team_id, changed_by_membership_id, edit_scope, summary)
        values (requested_organisation_id, instance_record.id, instance_record.team_id, actor_membership_id, 'this', jsonb_build_array(jsonb_build_object('field', 'status', 'from', 'scheduled', 'to', 'cancelled', 'reason', btrim(requested_reason))));
        insert into public.facility_notification_outbox (organisation_id, event_instance_id, team_id, kind, payload, idempotency_key)
        values (requested_organisation_id, instance_record.id, instance_record.team_id, 'event-cancelled', jsonb_build_object('reason', btrim(requested_reason)), 'facility-cancel:' || closure_id::text || ':' || instance_record.id::text);
      end loop;
      moved := moved || jsonb_build_array(jsonb_build_object('bookingId', affected.id, 'from', affected.reservation_unit_id, 'action', 'cancelled'));
      continue;
    end if;
    target_unit_id := action_value::uuid;
    if not exists (select 1 from public.reservation_units unit where unit.id = target_unit_id and unit.organisation_id = requested_organisation_id and unit.active) then
      raise exception 'replacement reservation unit is not active';
    end if;
    if exists (select 1 from public.facility_bookings other where other.organisation_id = requested_organisation_id and other.id <> affected.id and other.status <> 'cancelled'
      and public.reservation_units_conflict(requested_organisation_id, other.reservation_unit_id, target_unit_id)
      and tstzrange(other.starts_at - make_interval(mins => other.buffer_before_minutes), other.ends_at + make_interval(mins => other.buffer_after_minutes), '[)')
        && tstzrange(affected.starts_at - make_interval(mins => affected.buffer_before_minutes), affected.ends_at + make_interval(mins => affected.buffer_after_minutes), '[)'))
      or exists (select 1 from public.facility_blocks block where block.organisation_id = requested_organisation_id
        and public.reservation_units_conflict(requested_organisation_id, block.reservation_unit_id, target_unit_id)
        and tstzrange(block.starts_at, block.ends_at, '[)') && tstzrange(affected.starts_at - make_interval(mins => affected.buffer_before_minutes), affected.ends_at + make_interval(mins => affected.buffer_after_minutes), '[)'))
      or exists (select 1 from public.facility_closures closure where closure.organisation_id = requested_organisation_id
        and public.reservation_units_conflict(requested_organisation_id, closure.reservation_unit_id, target_unit_id)
        and tstzrange(closure.starts_at, closure.ends_at, '[)') && tstzrange(affected.starts_at - make_interval(mins => affected.buffer_before_minutes), affected.ends_at + make_interval(mins => affected.buffer_after_minutes), '[)'))
    then raise exception 'replacement facility booking conflict' using errcode = '23P01'; end if;
    update public.facility_bookings set reservation_unit_id = target_unit_id, updated_at = now() where id = affected.id and organisation_id = requested_organisation_id;
    for instance_record in select instance.id, instance.team_id, instance.location_name from public.event_instances instance
      where instance.organisation_id = requested_organisation_id and instance.id = affected.event_instance_id
        and tstzrange(instance.starts_at, instance.ends_at, '[)') && tstzrange(affected.starts_at, affected.ends_at, '[)') for update
    loop
      update public.event_instances instance set location_name = target.name, updated_at = now()
      from public.reservation_units target where instance.id = instance_record.id and instance.organisation_id = requested_organisation_id and target.id = target_unit_id and target.organisation_id = requested_organisation_id;
      insert into public.event_change_summaries (organisation_id, event_instance_id, team_id, changed_by_membership_id, edit_scope, summary)
      values (requested_organisation_id, instance_record.id, instance_record.team_id, actor_membership_id, 'this', jsonb_build_array(jsonb_build_object('field', 'location', 'from', instance_record.location_name, 'to', (select name from public.reservation_units where id = target_unit_id and organisation_id = requested_organisation_id))));
      insert into public.facility_notification_outbox (organisation_id, event_instance_id, team_id, kind, payload, idempotency_key)
      values (requested_organisation_id, instance_record.id, instance_record.team_id, 'facility-relocated', jsonb_build_object('reason', btrim(requested_reason), 'reservationUnitId', target_unit_id), 'facility-move:' || closure_id::text || ':' || instance_record.id::text);
    end loop;
    moved := moved || jsonb_build_array(jsonb_build_object('bookingId', affected.id, 'from', affected.reservation_unit_id, 'to', target_unit_id));
  end loop;
  insert into public.audit_log (organisation_id, actor_membership_id, action, resource_type, resource_id, reason, metadata)
  values (requested_organisation_id, actor_membership_id, 'facility.closed_and_relocated', 'facility_closure', closure_id, btrim(requested_reason), jsonb_build_object('relocated', moved));
  return jsonb_build_object('closureId', closure_id, 'relocated', moved);
end;
$$;

create function public.reserve_equipment(
  requested_organisation_id uuid,
  requested_item_id uuid,
  requested_event_id uuid,
  requested_quantity integer,
  requested_starts_at timestamptz,
  requested_ends_at timestamptz
) returns public.equipment_reservations language plpgsql security definer set search_path = '' as $$
declare available_quantity integer; reserved_quantity integer; created_reservation public.equipment_reservations;
begin
  if not public.has_capability(requested_organisation_id, 'equipment:manage', 'organisation', requested_organisation_id, null) then raise exception 'equipment access denied' using errcode = '42501'; end if;
  if requested_quantity < 1 or requested_starts_at >= requested_ends_at then raise exception 'invalid equipment reservation'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_organisation_id::text || ':' || requested_item_id::text, 0));
  select item.quantity into available_quantity from public.equipment_items item where item.id = requested_item_id and item.organisation_id = requested_organisation_id for update;
  if available_quantity is null then raise exception 'equipment item not found'; end if;
  select coalesce(sum(reservation.quantity), 0) into reserved_quantity from public.equipment_reservations reservation
  where reservation.organisation_id = requested_organisation_id and reservation.equipment_item_id = requested_item_id
    and tstzrange(reservation.starts_at, reservation.ends_at, '[)') && tstzrange(requested_starts_at, requested_ends_at, '[)');
  if reserved_quantity + requested_quantity > available_quantity then raise exception 'equipment quantity unavailable' using errcode = '23514'; end if;
  insert into public.equipment_reservations (organisation_id, equipment_item_id, event_id, quantity, starts_at, ends_at)
  values (requested_organisation_id, requested_item_id, requested_event_id, requested_quantity, requested_starts_at, requested_ends_at)
  returning * into created_reservation;
  return created_reservation;
end;
$$;

create function public.record_export_audit(
  requested_organisation_id uuid, requested_format text, requested_resource_type text,
  requested_watermark text, requested_row_count integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_membership_id uuid; audit_id uuid;
begin
  if not public.has_capability(requested_organisation_id, 'reports:view', 'organisation', requested_organisation_id, null) then raise exception 'report access denied' using errcode = '42501'; end if;
  select membership.id into actor_membership_id from public.memberships membership where membership.organisation_id = requested_organisation_id and membership.user_id = auth.uid() and membership.status = 'active';
  if actor_membership_id is null then raise exception 'active membership required' using errcode = '42501'; end if;
  insert into public.export_audit (organisation_id, actor_membership_id, format, resource_type, watermark, row_count)
  values (requested_organisation_id, actor_membership_id, requested_format, requested_resource_type, requested_watermark, requested_row_count) returning id into audit_id;
  return audit_id;
end;
$$;

create function public.create_club_document(
  requested_organisation_id uuid, requested_title text, requested_storage_path text, requested_checksum text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_membership_id uuid; document_id uuid;
begin
  if not public.has_capability(requested_organisation_id, 'documents:manage', 'organisation', requested_organisation_id, null) then raise exception 'document access denied' using errcode = '42501'; end if;
  select membership.id into actor_membership_id from public.memberships membership where membership.organisation_id = requested_organisation_id and membership.user_id = auth.uid() and membership.status = 'active';
  insert into public.club_documents (organisation_id, title, required_capability, current_version)
  values (requested_organisation_id, btrim(requested_title), 'documents:manage', 1) returning id into document_id;
  insert into public.club_document_versions (organisation_id, document_id, version, storage_path, checksum, created_by_membership_id)
  values (requested_organisation_id, document_id, 1, btrim(requested_storage_path), btrim(requested_checksum), actor_membership_id);
  return document_id;
end;
$$;

create function public.claim_facility_notification_outbox(requested_limit integer default 25)
returns setof public.facility_notification_outbox language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.facility_notification_outbox notice set delivery_status = 'processing', leased_at = now(), attempt_count = notice.attempt_count + 1
  where notice.id in (
    select candidate.id from public.facility_notification_outbox candidate
    where candidate.delivery_status = 'pending' or (candidate.delivery_status = 'processing' and candidate.leased_at < now() - interval '5 minutes')
    order by candidate.created_at for update skip locked limit greatest(1, least(requested_limit, 100))
  ) returning notice.*;
end;
$$;

create function public.complete_facility_notification(requested_notice_id uuid, requested_provider_message_id text)
returns void language sql security definer set search_path = '' as $$
  update public.facility_notification_outbox set delivery_status = 'sent', provider_message_id = requested_provider_message_id, last_error = null
  where id = requested_notice_id and delivery_status = 'processing';
$$;

create function public.fail_facility_notification(requested_notice_id uuid, requested_reason text)
returns void language sql security definer set search_path = '' as $$
  update public.facility_notification_outbox set delivery_status = 'failed', last_error = left(requested_reason, 500)
  where id = requested_notice_id and delivery_status = 'processing';
$$;

create function public.start_support_session(
  requested_organisation_id uuid,
  requested_support_request_id uuid,
  requested_reason text,
  requested_duration_minutes integer default 30
) returns public.support_sessions language plpgsql security definer set search_path = '' as $$
declare actor_membership_id uuid; created_session public.support_sessions; support_request_record public.support_requests; approved_types text[]; approved_ids uuid[];
begin
  if not public.has_capability(requested_organisation_id, 'support:manage', 'organisation', requested_organisation_id, null) then
    raise exception 'support access denied' using errcode = '42501';
  end if;
  if length(btrim(requested_reason)) < 10 then raise exception 'a specific support reason is required'; end if;
  if requested_duration_minutes < 1 or requested_duration_minutes > 60 then raise exception 'support duration must be between 1 and 60 minutes'; end if;
  select membership.id into actor_membership_id from public.memberships membership
  where membership.organisation_id = requested_organisation_id and membership.user_id = auth.uid() and membership.status = 'active';
  if actor_membership_id is null then raise exception 'active membership required' using errcode = '42501'; end if;
  select * into support_request_record from public.support_requests request where request.id = requested_support_request_id and request.organisation_id = requested_organisation_id and request.status in ('open', 'investigating') for update;
  if not found then raise exception 'support request not found'; end if;
  select coalesce(array_agg(resource ->> 'type'), array[]::text[]), coalesce(array_agg((resource ->> 'id')::uuid), array[]::uuid[])
    into approved_types, approved_ids from jsonb_array_elements(support_request_record.authorised_resources) resource;
  if not approved_types <@ array['venue', 'facility', 'facility_booking', 'event']::text[] then raise exception 'support resource type denied'; end if;
  insert into public.support_sessions (organisation_id, support_request_id, operator_membership_id, reason, starts_at, expires_at, allowed_resources, allowed_resource_ids)
  values (requested_organisation_id, requested_support_request_id, actor_membership_id, btrim(requested_reason), now(), now() + make_interval(mins => requested_duration_minutes), approved_types, approved_ids)
  returning * into created_session;
  insert into public.audit_log (organisation_id, actor_membership_id, action, resource_type, resource_id, reason, metadata)
  values (requested_organisation_id, actor_membership_id, 'support.session.started', 'support_session', created_session.id, created_session.reason, jsonb_build_object('expiresAt', created_session.expires_at));
  return created_session;
end;
$$;

create function public.revoke_support_session(requested_session_id uuid, requested_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare support_session public.support_sessions; requester_user_id uuid;
begin
  if length(btrim(requested_reason)) < 5 then raise exception 'a revocation reason is required'; end if;
  select * into support_session from public.support_sessions where id = requested_session_id for update;
  if not found then raise exception 'support session not found'; end if;
  select membership.user_id into requester_user_id from public.support_requests request
  join public.memberships membership on membership.id = request.requested_by_membership_id and membership.organisation_id = request.organisation_id
  where request.id = support_session.support_request_id and request.organisation_id = support_session.organisation_id;
  if auth.uid() <> requester_user_id and not exists (
    select 1 from public.memberships membership where membership.id = support_session.operator_membership_id and membership.user_id = auth.uid() and membership.status = 'active'
  ) then raise exception 'support revocation denied' using errcode = '42501'; end if;
  update public.support_sessions set revoked_at = now(), revoked_by_user_id = auth.uid(), revocation_reason = btrim(requested_reason)
  where id = requested_session_id and revoked_at is null;
  insert into public.audit_log (organisation_id, action, resource_type, resource_id, reason, metadata)
  values (support_session.organisation_id, 'support.session.revoked', 'support_session', support_session.id, btrim(requested_reason), jsonb_build_object('revokedBy', auth.uid()));
end;
$$;

create function public.read_support_resource(requested_session_id uuid, requested_resource_type text, requested_resource_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare support_session public.support_sessions; result jsonb;
begin
  select session.* into support_session from public.support_sessions session
  join public.memberships operator on operator.id = session.operator_membership_id and operator.organisation_id = session.organisation_id
  where session.id = requested_session_id and operator.user_id = auth.uid() and operator.status = 'active'
    and session.revoked_at is null and session.starts_at <= now() and session.expires_at > now()
    and requested_resource_type = any(session.allowed_resources) and requested_resource_id = any(session.allowed_resource_ids);
  if not found then raise exception 'active authorised support session required' using errcode = '42501'; end if;
  case requested_resource_type
    when 'venue' then select to_jsonb(venue) into result from public.venues venue where venue.id = requested_resource_id and venue.organisation_id = support_session.organisation_id;
    when 'facility' then select to_jsonb(facility) into result from public.facilities facility where facility.id = requested_resource_id and facility.organisation_id = support_session.organisation_id;
    when 'facility_booking' then select to_jsonb(booking) into result from public.facility_bookings booking where booking.id = requested_resource_id and booking.organisation_id = support_session.organisation_id;
    when 'event' then select to_jsonb(event) into result from public.events event where event.id = requested_resource_id and event.organisation_id = support_session.organisation_id;
    else raise exception 'support resource type denied' using errcode = '42501';
  end case;
  if result is null then raise exception 'support resource not found'; end if;
  insert into public.audit_log (organisation_id, actor_membership_id, action, resource_type, resource_id, reason, metadata)
  values (support_session.organisation_id, support_session.operator_membership_id, 'support.resource.read', requested_resource_type, requested_resource_id, support_session.reason, jsonb_build_object('sessionId', support_session.id));
  return result;
end;
$$;

revoke all on function public.reservation_units_conflict(uuid, uuid, uuid) from public;
revoke all on function public.allocate_facility_booking(uuid, uuid, uuid, text, timestamptz, timestamptz, integer, integer) from public;
revoke all on function public.close_and_relocate_facility_bookings(uuid, uuid, timestamptz, timestamptz, text, jsonb) from public;
revoke all on function public.preview_facility_closure_impacts(uuid, uuid, timestamptz, timestamptz) from public;
revoke all on function public.create_facility_block(uuid, uuid, timestamptz, timestamptz, text) from public;
revoke all on function public.start_support_session(uuid, uuid, text, integer) from public;
revoke all on function public.reserve_equipment(uuid, uuid, uuid, integer, timestamptz, timestamptz) from public;
revoke all on function public.record_export_audit(uuid, text, text, text, integer) from public;
revoke all on function public.create_club_document(uuid, text, text, text) from public;
revoke all on function public.claim_facility_notification_outbox(integer) from public;
revoke all on function public.complete_facility_notification(uuid, text) from public;
revoke all on function public.fail_facility_notification(uuid, text) from public;
revoke all on function public.revoke_support_session(uuid, text) from public;
revoke all on function public.read_support_resource(uuid, text, uuid) from public;
grant execute on function public.allocate_facility_booking(uuid, uuid, uuid, text, timestamptz, timestamptz, integer, integer) to authenticated;
grant execute on function public.close_and_relocate_facility_bookings(uuid, uuid, timestamptz, timestamptz, text, jsonb) to authenticated;
grant execute on function public.preview_facility_closure_impacts(uuid, uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.create_facility_block(uuid, uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.start_support_session(uuid, uuid, text, integer) to authenticated;
grant execute on function public.reserve_equipment(uuid, uuid, uuid, integer, timestamptz, timestamptz) to authenticated;
grant execute on function public.record_export_audit(uuid, text, text, text, integer) to authenticated;
grant execute on function public.create_club_document(uuid, text, text, text) to authenticated;
grant execute on function public.claim_facility_notification_outbox(integer) to service_role;
grant execute on function public.complete_facility_notification(uuid, text) to service_role;
grant execute on function public.fail_facility_notification(uuid, text) to service_role;
grant execute on function public.revoke_support_session(uuid, text) to authenticated;
grant execute on function public.read_support_resource(uuid, text, uuid) to authenticated;

do $$ declare table_name text; begin
  foreach table_name in array array[
    'venues','facilities','reservation_units','reservation_unit_exclusions','facility_bookings','facility_blocks',
    'facility_inspections','facility_closures','maintenance_requests','facility_assets','external_hires','club_documents',
    'club_document_versions','equipment_items','equipment_reservations','volunteer_shifts','volunteer_shift_assignments',
    'export_audit','support_requests','support_sessions','audit_log','facility_notification_outbox'
  ] loop execute format('alter table public.%I enable row level security', table_name); end loop;
end $$;

create policy venues_view on public.venues for select to authenticated using (public.has_capability(organisation_id, 'venues:manage', 'organisation', organisation_id, null));
create policy venues_manage on public.venues for all to authenticated using (public.has_capability(organisation_id, 'venues:manage', 'organisation', organisation_id, null)) with check (public.has_capability(organisation_id, 'venues:manage', 'organisation', organisation_id, null));
create policy facilities_view on public.facilities for select to authenticated using (public.has_capability(organisation_id, 'venues:manage', 'organisation', organisation_id, null));
create policy facilities_manage on public.facilities for all to authenticated using (public.has_capability(organisation_id, 'venues:manage', 'organisation', organisation_id, null)) with check (public.has_capability(organisation_id, 'venues:manage', 'organisation', organisation_id, null));
create policy reservation_units_view on public.reservation_units for select to authenticated using (public.has_capability(organisation_id, 'pitches:manage', 'organisation', organisation_id, null) or public.has_capability(organisation_id, 'pitches:inspect', 'organisation', organisation_id, null));
create policy reservation_units_manage on public.reservation_units for all to authenticated using (public.has_capability(organisation_id, 'pitches:manage', 'organisation', organisation_id, null)) with check (public.has_capability(organisation_id, 'pitches:manage', 'organisation', organisation_id, null));
create policy exclusions_manage on public.reservation_unit_exclusions for all to authenticated using (public.has_capability(organisation_id, 'pitches:manage', 'organisation', organisation_id, null)) with check (public.has_capability(organisation_id, 'pitches:manage', 'organisation', organisation_id, null));
create policy bookings_view on public.facility_bookings for select to authenticated using (public.has_capability(organisation_id, 'pitches:manage', 'organisation', organisation_id, null) or public.has_capability(organisation_id, 'pitches:inspect', 'organisation', organisation_id, null));
create policy bookings_manage on public.facility_bookings for all to authenticated using (public.has_capability(organisation_id, 'pitches:manage', 'organisation', organisation_id, null)) with check (public.has_capability(organisation_id, 'pitches:manage', 'organisation', organisation_id, null));
create policy blocks_manage on public.facility_blocks for all to authenticated using (public.has_capability(organisation_id, 'pitches:manage', 'organisation', organisation_id, null)) with check (public.has_capability(organisation_id, 'pitches:manage', 'organisation', organisation_id, null));
create policy inspections_manage on public.facility_inspections for all to authenticated using (public.has_capability(organisation_id, 'pitches:inspect', 'organisation', organisation_id, null)) with check (public.has_capability(organisation_id, 'pitches:inspect', 'organisation', organisation_id, null));
create policy closures_view on public.facility_closures for select to authenticated using (public.has_capability(organisation_id, 'pitches:manage', 'organisation', organisation_id, null) or public.has_capability(organisation_id, 'pitches:inspect', 'organisation', organisation_id, null));
create policy maintenance_manage on public.maintenance_requests for all to authenticated using (public.has_capability(organisation_id, 'facilities:manage', 'organisation', organisation_id, null)) with check (public.has_capability(organisation_id, 'facilities:manage', 'organisation', organisation_id, null));
create policy assets_manage on public.facility_assets for all to authenticated using (public.has_capability(organisation_id, 'facilities:manage', 'organisation', organisation_id, null)) with check (public.has_capability(organisation_id, 'facilities:manage', 'organisation', organisation_id, null));
create policy hires_manage on public.external_hires for all to authenticated using (public.has_capability(organisation_id, 'facilities:manage', 'organisation', organisation_id, null)) with check (public.has_capability(organisation_id, 'facilities:manage', 'organisation', organisation_id, null));
create policy documents_view on public.club_documents for select to authenticated using (public.has_capability(organisation_id, required_capability, 'organisation', organisation_id, null));
create policy documents_insert on public.club_documents for insert to authenticated with check (public.has_capability(organisation_id, 'documents:manage', 'organisation', organisation_id, null));
create policy documents_update on public.club_documents for update to authenticated using (public.has_capability(organisation_id, 'documents:manage', 'organisation', organisation_id, null)) with check (public.has_capability(organisation_id, 'documents:manage', 'organisation', organisation_id, null));
create policy documents_delete on public.club_documents for delete to authenticated using (public.has_capability(organisation_id, 'documents:manage', 'organisation', organisation_id, null));
create policy document_versions_manage on public.club_document_versions for all to authenticated using (public.has_capability(organisation_id, 'documents:manage', 'organisation', organisation_id, null)) with check (public.has_capability(organisation_id, 'documents:manage', 'organisation', organisation_id, null));
create policy equipment_manage on public.equipment_items for all to authenticated using (public.has_capability(organisation_id, 'equipment:manage', 'organisation', organisation_id, null)) with check (public.has_capability(organisation_id, 'equipment:manage', 'organisation', organisation_id, null));
create policy equipment_reservations_manage on public.equipment_reservations for all to authenticated using (public.has_capability(organisation_id, 'equipment:manage', 'organisation', organisation_id, null)) with check (public.has_capability(organisation_id, 'equipment:manage', 'organisation', organisation_id, null));
create policy volunteer_shifts_manage on public.volunteer_shifts for all to authenticated using (public.has_capability(organisation_id, 'volunteers:manage', 'organisation', organisation_id, null)) with check (public.has_capability(organisation_id, 'volunteers:manage', 'organisation', organisation_id, null));
create policy volunteer_assignments_manage on public.volunteer_shift_assignments for all to authenticated using (public.has_capability(organisation_id, 'volunteers:manage', 'organisation', organisation_id, null)) with check (public.has_capability(organisation_id, 'volunteers:manage', 'organisation', organisation_id, null));
create policy exports_view on public.export_audit for select to authenticated using (public.has_capability(organisation_id, 'audit:view', 'organisation', organisation_id, null));
create policy support_requests_create on public.support_requests for insert to authenticated with check (
  public.has_capability(organisation_id, 'support:request', 'organisation', organisation_id, null)
  and requested_by_membership_id in (select membership.id from public.memberships membership where membership.organisation_id = organisation_id and membership.user_id = auth.uid() and membership.status = 'active')
);
create policy support_requests_view on public.support_requests for select to authenticated using (public.has_capability(organisation_id, 'support:request', 'organisation', organisation_id, null) or public.has_capability(organisation_id, 'support:manage', 'organisation', organisation_id, null));
create policy support_sessions_manage on public.support_sessions for all to authenticated using (public.has_capability(organisation_id, 'support:manage', 'organisation', organisation_id, null) and revoked_at is null and starts_at <= now() and expires_at > now()) with check (public.has_capability(organisation_id, 'support:manage', 'organisation', organisation_id, null) and expires_at <= starts_at + interval '60 minutes');
create policy audit_view on public.audit_log for select to authenticated using (public.has_capability(organisation_id, 'audit:view', 'organisation', organisation_id, null));
create policy facility_outbox_view on public.facility_notification_outbox for select to authenticated using (public.has_capability(organisation_id, 'audit:view', 'organisation', organisation_id, null));

revoke all on table public.venues, public.facilities, public.reservation_units, public.reservation_unit_exclusions,
  public.facility_bookings, public.facility_blocks, public.facility_inspections, public.facility_closures,
  public.maintenance_requests, public.facility_assets, public.external_hires, public.club_documents,
  public.club_document_versions, public.equipment_items, public.equipment_reservations, public.volunteer_shifts,
  public.volunteer_shift_assignments, public.export_audit, public.support_requests, public.support_sessions,
  public.audit_log, public.facility_notification_outbox from authenticated;
grant select, insert, update, delete on public.venues, public.facilities, public.reservation_units,
  public.reservation_unit_exclusions, public.facility_inspections,
  public.maintenance_requests, public.facility_assets, public.external_hires, public.club_documents,
  public.club_document_versions, public.equipment_items, public.volunteer_shifts,
  public.volunteer_shift_assignments to authenticated;
grant select on public.facility_bookings, public.facility_blocks, public.facility_closures, public.equipment_reservations, public.export_audit, public.support_sessions, public.audit_log, public.facility_notification_outbox to authenticated;
grant select, insert on public.support_requests to authenticated;

create trigger venues_set_updated_at before update on public.venues for each row execute function public.set_updated_at();
create trigger facilities_set_updated_at before update on public.facilities for each row execute function public.set_updated_at();
create trigger reservation_units_set_updated_at before update on public.reservation_units for each row execute function public.set_updated_at();
create trigger facility_bookings_set_updated_at before update on public.facility_bookings for each row execute function public.set_updated_at();
create trigger maintenance_requests_set_updated_at before update on public.maintenance_requests for each row execute function public.set_updated_at();
