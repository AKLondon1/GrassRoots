create type public.event_kind as enum ('training', 'match', 'meeting', 'social');
create type public.event_status as enum ('scheduled', 'cancelled', 'completed');
create type public.availability_status as enum ('available', 'unavailable', 'unsure');
create type public.poll_status as enum ('draft', 'open', 'closed', 'converted');
create type public.poll_response_status as enum ('available', 'unavailable', 'maybe');
create type public.squad_member_status as enum ('selected', 'standby', 'withdrawn');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid not null,
  kind public.event_kind not null,
  title text not null check (length(btrim(title)) between 2 and 120),
  default_location_name text check (default_location_name is null or length(btrim(default_location_name)) between 2 and 160),
  created_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (team_id, organisation_id) references public.teams(id, organisation_id) on delete cascade,
  foreign key (created_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  unique (id, organisation_id),
  unique (id, organisation_id, team_id)
);

create table public.event_series (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_id uuid not null,
  team_id uuid not null,
  time_zone text not null default 'Europe/London' check (length(time_zone) between 3 and 80),
  recurrence_rule jsonb not null default '{}'::jsonb check (jsonb_typeof(recurrence_rule) = 'object'),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  until_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, organisation_id, team_id) references public.events(id, organisation_id, team_id) on delete cascade,
  unique (id, organisation_id),
  unique (id, organisation_id, team_id),
  unique (id, organisation_id, team_id, event_id),
  check (ends_at > starts_at),
  check (until_at is null or until_at >= starts_at)
);

create table public.event_instances (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_id uuid not null,
  series_id uuid,
  team_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  response_deadline timestamptz,
  location_name text,
  status public.event_status not null default 'scheduled',
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, organisation_id, team_id) references public.events(id, organisation_id, team_id) on delete cascade,
  foreign key (series_id, organisation_id, team_id, event_id) references public.event_series(id, organisation_id, team_id, event_id) on delete cascade,
  unique (id, organisation_id),
  unique (id, organisation_id, team_id),
  unique (id, organisation_id, team_id, series_id),
  unique nulls not distinct (organisation_id, series_id, starts_at),
  check (ends_at > starts_at),
  check (response_deadline is null or response_deadline <= starts_at),
  check ((status = 'cancelled' and cancelled_reason is not null) or status <> 'cancelled')
);

create table public.event_exceptions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  series_id uuid not null,
  team_id uuid not null,
  original_starts_at timestamptz not null,
  replacement_instance_id uuid,
  is_cancelled boolean not null default false,
  patch jsonb not null default '{}'::jsonb check (jsonb_typeof(patch) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (series_id, organisation_id, team_id) references public.event_series(id, organisation_id, team_id) on delete cascade,
  foreign key (replacement_instance_id, organisation_id, team_id, series_id) references public.event_instances(id, organisation_id, team_id, series_id) on update cascade on delete cascade,
  unique (organisation_id, series_id, original_starts_at),
  unique (id, organisation_id),
  check (is_cancelled or replacement_instance_id is not null)
);

create table public.event_change_summaries (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_instance_id uuid not null,
  team_id uuid not null,
  changed_by_membership_id uuid not null,
  edit_scope text not null check (edit_scope in ('this', 'this-and-future', 'all')),
  summary jsonb not null check (jsonb_typeof(summary) = 'array'),
  created_at timestamptz not null default now(),
  foreign key (event_instance_id, organisation_id, team_id) references public.event_instances(id, organisation_id, team_id) on delete cascade,
  foreign key (changed_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  unique (id, organisation_id)
);

create table public.availability_responses (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_instance_id uuid not null,
  team_id uuid not null,
  player_id uuid not null,
  guardian_id uuid not null,
  status public.availability_status not null,
  note text check (note is null or length(note) <= 240),
  transport_seats smallint check (transport_seats between 0 and 8),
  idempotency_key text not null check (length(idempotency_key) between 8 and 120),
  responded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_instance_id, organisation_id, team_id) references public.event_instances(id, organisation_id, team_id) on delete cascade,
  foreign key (player_id, organisation_id) references public.players(id, organisation_id) on delete cascade,
  foreign key (guardian_id, organisation_id) references public.guardians(id, organisation_id) on delete cascade,
  unique (organisation_id, event_instance_id, player_id),
  unique (organisation_id, idempotency_key),
  unique (id, organisation_id)
);

create table public.event_attendance (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_instance_id uuid not null,
  team_id uuid not null,
  player_id uuid not null,
  status text not null check (status in ('present', 'absent', 'late', 'excused')),
  recorded_by_membership_id uuid not null,
  recorded_at timestamptz not null default now(),
  foreign key (event_instance_id, organisation_id, team_id) references public.event_instances(id, organisation_id, team_id) on delete cascade,
  foreign key (player_id, organisation_id) references public.players(id, organisation_id) on delete cascade,
  foreign key (recorded_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  unique (organisation_id, event_instance_id, player_id),
  unique (id, organisation_id)
);

create table public.event_staff (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_instance_id uuid not null,
  team_id uuid not null,
  membership_id uuid not null,
  role_label text not null check (length(btrim(role_label)) between 2 and 80),
  attendance_status text not null default 'expected' check (attendance_status in ('expected', 'present', 'absent')),
  foreign key (event_instance_id, organisation_id, team_id) references public.event_instances(id, organisation_id, team_id) on delete cascade,
  foreign key (membership_id, organisation_id) references public.memberships(id, organisation_id) on delete cascade,
  unique (organisation_id, event_instance_id, membership_id),
  unique (id, organisation_id)
);

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid not null,
  title text not null check (length(btrim(title)) between 2 and 120),
  status public.poll_status not null default 'draft',
  closes_at timestamptz not null,
  converted_series_id uuid,
  converted_option_id uuid,
  conversion_idempotency_key text check (conversion_idempotency_key is null or length(conversion_idempotency_key) between 8 and 120),
  created_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (team_id, organisation_id) references public.teams(id, organisation_id) on delete cascade,
  foreign key (converted_series_id, organisation_id, team_id) references public.event_series(id, organisation_id, team_id) on delete restrict,
  foreign key (created_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  unique (id, organisation_id),
  unique (id, organisation_id, team_id),
  unique (organisation_id, conversion_idempotency_key),
  check (
    (status = 'converted' and converted_series_id is not null and converted_option_id is not null and conversion_idempotency_key is not null)
    or (status <> 'converted' and converted_series_id is null and converted_option_id is null and conversion_idempotency_key is null)
  )
);

create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  poll_id uuid not null,
  team_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  pitch_capacity smallint check (pitch_capacity is null or pitch_capacity > 0),
  created_at timestamptz not null default now(),
  foreign key (poll_id, organisation_id, team_id) references public.polls(id, organisation_id, team_id) on delete cascade,
  unique (organisation_id, poll_id, starts_at),
  unique (id, organisation_id),
  unique (id, organisation_id, poll_id),
  check (ends_at > starts_at)
);

create table public.poll_respondents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  poll_id uuid not null,
  team_id uuid not null,
  player_id uuid,
  membership_id uuid,
  created_at timestamptz not null default now(),
  foreign key (poll_id, organisation_id, team_id) references public.polls(id, organisation_id, team_id) on delete cascade,
  foreign key (player_id, organisation_id) references public.players(id, organisation_id) on delete cascade,
  foreign key (membership_id, organisation_id) references public.memberships(id, organisation_id) on delete cascade,
  unique nulls not distinct (organisation_id, poll_id, player_id, membership_id),
  unique (id, organisation_id),
  unique (id, organisation_id, poll_id),
  check ((player_id is not null)::integer + (membership_id is not null)::integer = 1)
);

alter table public.polls
  add foreign key (converted_option_id, organisation_id, id)
  references public.poll_options(id, organisation_id, poll_id) on delete restrict;

create table public.poll_responses (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  poll_id uuid not null,
  option_id uuid not null,
  respondent_id uuid not null,
  response public.poll_response_status not null,
  responded_at timestamptz not null default now(),
  foreign key (option_id, organisation_id, poll_id) references public.poll_options(id, organisation_id, poll_id) on delete cascade,
  foreign key (respondent_id, organisation_id, poll_id) references public.poll_respondents(id, organisation_id, poll_id) on delete cascade,
  unique (organisation_id, option_id, respondent_id),
  unique (id, organisation_id)
);

create table public.squads (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_instance_id uuid not null,
  team_id uuid not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  published_at timestamptz,
  published_by_membership_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_instance_id, organisation_id, team_id) references public.event_instances(id, organisation_id, team_id) on delete cascade,
  foreign key (published_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  unique (organisation_id, event_instance_id),
  unique (id, organisation_id),
  unique (id, organisation_id, team_id),
  check ((status = 'published' and published_at is not null and published_by_membership_id is not null) or status <> 'published')
);

create table public.squad_members (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  squad_id uuid not null,
  team_id uuid not null,
  player_id uuid not null,
  status public.squad_member_status not null,
  position_order smallint check (position_order is null or position_order > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (squad_id, organisation_id, team_id) references public.squads(id, organisation_id, team_id) on delete cascade,
  foreign key (player_id, organisation_id) references public.players(id, organisation_id) on delete cascade,
  unique (organisation_id, squad_id, player_id),
  unique (id, organisation_id),
  unique (id, organisation_id, squad_id)
);

create table public.squad_history (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  squad_id uuid not null,
  squad_member_id uuid,
  team_id uuid not null,
  player_id uuid not null,
  previous_status public.squad_member_status,
  next_status public.squad_member_status not null,
  reason text not null check (length(btrim(reason)) between 2 and 120),
  changed_by_membership_id uuid not null,
  changed_at timestamptz not null default now(),
  foreign key (squad_id, organisation_id, team_id) references public.squads(id, organisation_id, team_id) on delete cascade,
  foreign key (squad_member_id, organisation_id, squad_id) references public.squad_members(id, organisation_id, squad_id) on delete set null (squad_member_id),
  foreign key (player_id, organisation_id) references public.players(id, organisation_id) on delete cascade,
  foreign key (changed_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  unique (id, organisation_id)
);

create table public.standby_replacements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  squad_id uuid not null,
  team_id uuid not null,
  withdrawn_player_id uuid not null,
  standby_player_id uuid not null,
  status text not null default 'offered' check (status in ('offered', 'accepted', 'declined', 'expired')),
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz,
  foreign key (squad_id, organisation_id, team_id) references public.squads(id, organisation_id, team_id) on delete cascade,
  foreign key (withdrawn_player_id, organisation_id) references public.players(id, organisation_id) on delete cascade,
  foreign key (standby_player_id, organisation_id) references public.players(id, organisation_id) on delete cascade,
  unique (organisation_id, squad_id, standby_player_id),
  unique (id, organisation_id),
  check (withdrawn_player_id <> standby_player_id),
  check (expires_at > offered_at),
  check (responded_at is null or responded_at >= offered_at),
  check ((status in ('accepted', 'declined') and responded_at is not null) or status not in ('accepted', 'declined'))
);

create table public.transport_offers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_instance_id uuid not null,
  team_id uuid not null,
  guardian_id uuid not null,
  available_seats smallint not null check (available_seats between 1 and 8),
  notes text check (notes is null or length(notes) <= 240),
  foreign key (event_instance_id, organisation_id, team_id) references public.event_instances(id, organisation_id, team_id) on delete cascade,
  foreign key (guardian_id, organisation_id) references public.guardians(id, organisation_id) on delete cascade,
  unique (organisation_id, event_instance_id, guardian_id),
  unique (id, organisation_id)
);

create table public.transport_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_instance_id uuid not null,
  team_id uuid not null,
  player_id uuid not null,
  guardian_id uuid not null,
  status text not null default 'open' check (status in ('open', 'matched', 'cancelled')),
  matched_offer_id uuid,
  foreign key (event_instance_id, organisation_id, team_id) references public.event_instances(id, organisation_id, team_id) on delete cascade,
  foreign key (player_id, organisation_id) references public.players(id, organisation_id) on delete cascade,
  foreign key (guardian_id, organisation_id) references public.guardians(id, organisation_id) on delete cascade,
  foreign key (matched_offer_id, organisation_id) references public.transport_offers(id, organisation_id) on delete set null (matched_offer_id),
  unique (organisation_id, event_instance_id, player_id),
  unique (id, organisation_id),
  check ((status = 'matched' and matched_offer_id is not null) or status <> 'matched')
);

create table public.private_calendar_tokens (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  membership_id uuid not null,
  token_digest text not null unique check (token_digest ~ '^[0-9a-f]{64}$'),
  label text not null check (length(btrim(label)) between 2 and 80),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (membership_id, organisation_id) references public.memberships(id, organisation_id) on delete cascade,
  unique (id, organisation_id)
);

insert into public.permissions (key, description)
values
  ('announcements:view', 'View team announcements'),
  ('availability:manage', 'Manage team availability'),
  ('availability:respond', 'Respond to availability for a linked player'),
  ('attendance:manage', 'Manage event attendance'),
  ('calendar:manage', 'Manage private calendar links'),
  ('events:manage', 'Manage canonical team events'),
  ('events:view', 'View team events'),
  ('polls:manage', 'Manage team time polls'),
  ('polls:respond', 'Respond to team time polls'),
  ('squads:manage', 'Publish and update squads'),
  ('squads:respond', 'Respond to a standby offer'),
  ('squads:view', 'View a published squad status')
on conflict (key) do nothing;

create function public.grant_phase2_role_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.role_permissions (organisation_id, role_id, permission_id)
  select new.organisation_id, new.id, permission.id
  from public.permissions permission
  where
    (new.key in ('owner', 'club-admin') and permission.key in (
      'announcements:view', 'availability:manage', 'availability:respond', 'attendance:manage',
      'calendar:manage', 'events:manage', 'events:view', 'polls:manage', 'polls:respond',
      'squads:manage', 'squads:respond', 'squads:view'
    ))
    or (new.key in ('coach', 'manager') and permission.key in (
      'announcements:view', 'availability:manage', 'attendance:manage', 'events:manage',
      'events:view', 'polls:manage', 'polls:respond', 'squads:manage', 'squads:view'
    ))
    or (new.key = 'guardian' and permission.key in (
      'announcements:view', 'availability:respond', 'calendar:manage', 'events:view',
      'polls:respond', 'squads:respond', 'squads:view'
    ))
  on conflict (organisation_id, role_id, permission_id) do nothing;
  return new;
end;
$$;

create trigger roles_grant_phase2_permissions
after insert on public.roles
for each row execute function public.grant_phase2_role_permissions();

insert into public.role_permissions (organisation_id, role_id, permission_id)
select role.organisation_id, role.id, permission.id
from public.roles role
cross join public.permissions permission
where
  (role.key in ('owner', 'club-admin') and permission.key in (
    'announcements:view', 'availability:manage', 'availability:respond', 'attendance:manage',
    'calendar:manage', 'events:manage', 'events:view', 'polls:manage', 'polls:respond',
    'squads:manage', 'squads:respond', 'squads:view'
  ))
  or (role.key in ('coach', 'manager') and permission.key in (
    'announcements:view', 'availability:manage', 'attendance:manage', 'events:manage',
    'events:view', 'polls:manage', 'polls:respond', 'squads:manage', 'squads:view'
  ))
  or (role.key = 'guardian' and permission.key in (
    'announcements:view', 'availability:respond', 'calendar:manage', 'events:view',
    'polls:respond', 'squads:respond', 'squads:view'
  ))
on conflict (organisation_id, role_id, permission_id) do nothing;

create index events_team_idx on public.events (organisation_id, team_id, kind);
create index event_series_event_idx on public.event_series (organisation_id, event_id, starts_at);
create index event_instances_agenda_idx on public.event_instances (organisation_id, team_id, starts_at) where status = 'scheduled';
create index event_exceptions_series_idx on public.event_exceptions (organisation_id, series_id, original_starts_at);
create index availability_event_status_idx on public.availability_responses (organisation_id, event_instance_id, status);
create index attendance_event_status_idx on public.event_attendance (organisation_id, event_instance_id, status);
create index polls_team_status_idx on public.polls (organisation_id, team_id, status, closes_at);
create index poll_responses_poll_idx on public.poll_responses (organisation_id, poll_id, option_id);
create index squad_members_squad_status_idx on public.squad_members (organisation_id, squad_id, status, position_order);
create index squad_history_player_idx on public.squad_history (organisation_id, player_id, changed_at desc);
create index standby_open_idx on public.standby_replacements (organisation_id, expires_at) where status = 'offered';
create index calendar_tokens_membership_idx on public.private_calendar_tokens (organisation_id, membership_id) where revoked_at is null;

create function public.can_access_team(
  requested_organisation_id uuid,
  requested_team_id uuid,
  requested_capability text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships membership
    join public.organisations organisation on organisation.id = membership.organisation_id
    join public.scoped_role_assignments assignment
      on assignment.membership_id = membership.id
      and assignment.organisation_id = membership.organisation_id
    join public.roles role
      on role.id = assignment.role_id
      and role.organisation_id = assignment.organisation_id
    join public.role_permissions role_permission
      on role_permission.role_id = role.id
      and role_permission.organisation_id = role.organisation_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.organisation_id = requested_organisation_id
      and organisation.status = 'active'
      and permission.key = requested_capability
      and (
        role.key <> 'guardian'
        or exists (
          select 1
          from public.guardians active_guardian
          where active_guardian.membership_id = membership.id
            and active_guardian.organisation_id = requested_organisation_id
            and active_guardian.status = 'active'
        )
      )
      and (
        (assignment.scope_kind = 'team' and assignment.scope_id = requested_team_id)
        or (
          assignment.scope_kind = 'organisation'
          and assignment.scope_id = requested_organisation_id
          and (
            role.key <> 'guardian'
            or exists (
              select 1
              from public.guardians guardian
              join public.player_guardians link
                on link.guardian_id = guardian.id
                and link.organisation_id = guardian.organisation_id
              join public.team_memberships team_member
                on team_member.player_id = link.player_id
                and team_member.organisation_id = link.organisation_id
              where guardian.membership_id = membership.id
                and guardian.organisation_id = requested_organisation_id
                and guardian.status = 'active'
                and team_member.team_id = requested_team_id
                and team_member.status = 'active'
            )
          )
        )
      )
  );
$$;

create function public.guardian_can_respond_for_player(
  requested_organisation_id uuid,
  requested_team_id uuid,
  requested_player_id uuid,
  requested_capability text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_access_team(requested_organisation_id, requested_team_id, requested_capability)
    and exists (
      select 1
      from public.team_memberships team_member
      join public.player_guardians player_guardian
        on player_guardian.player_id = team_member.player_id
        and player_guardian.organisation_id = team_member.organisation_id
      join public.guardians guardian
        on guardian.id = player_guardian.guardian_id
        and guardian.organisation_id = player_guardian.organisation_id
      join public.memberships membership
        on membership.id = guardian.membership_id
        and membership.organisation_id = guardian.organisation_id
      where team_member.organisation_id = requested_organisation_id
        and team_member.team_id = requested_team_id
        and team_member.player_id = requested_player_id
        and team_member.status = 'active'
        and guardian.status = 'active'
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    );
$$;

create function public.availability_response_is_open(
  requested_organisation_id uuid,
  requested_event_instance_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.event_instances instance
    where instance.id = requested_event_instance_id
      and instance.organisation_id = requested_organisation_id
      and instance.status = 'scheduled'
      and (instance.response_deadline is null or instance.response_deadline >= now())
  );
$$;

create function public.validate_event_child_team_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name in (
    'availability_responses', 'event_attendance', 'poll_respondents',
    'squad_members', 'squad_history', 'transport_requests'
  ) and not exists (
    select 1 from public.team_memberships team_member
    where team_member.organisation_id = new.organisation_id
      and team_member.team_id = new.team_id
      and team_member.player_id = new.player_id
      and team_member.status = 'active'
  ) then
    raise foreign_key_violation using message = 'Availability player must belong to the event team.';
  end if;
  if tg_table_name in ('availability_responses', 'transport_requests') and not exists (
    select 1 from public.player_guardians link
    where link.organisation_id = new.organisation_id
      and link.player_id = new.player_id
      and link.guardian_id = new.guardian_id
  ) then
    raise foreign_key_violation using message = 'Guardian must be linked to the player.';
  end if;
  return new;
end;
$$;

create function public.convert_poll_to_event_series(
  requested_organisation_id uuid,
  requested_poll_id uuid,
  requested_option_id uuid,
  requested_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  poll_record public.polls%rowtype;
  option_record public.poll_options%rowtype;
  acting_membership_id uuid;
  created_event_id uuid;
  created_series_id uuid;
begin
  if length(requested_idempotency_key) not between 8 and 120 then
    raise exception 'Poll conversion idempotency key is invalid';
  end if;

  select * into poll_record
  from public.polls poll
  where poll.organisation_id = requested_organisation_id
    and poll.conversion_idempotency_key = requested_idempotency_key
  for update;

  if found then
    if poll_record.id <> requested_poll_id or poll_record.converted_option_id <> requested_option_id then
      raise exception 'Poll conversion idempotency key was already used';
    end if;
    if not public.can_access_team(requested_organisation_id, poll_record.team_id, 'polls:manage') then
      raise insufficient_privilege using message = 'Poll conversion is not authorised';
    end if;
    return poll_record.converted_series_id;
  end if;

  select * into poll_record
  from public.polls poll
  where poll.id = requested_poll_id
    and poll.organisation_id = requested_organisation_id
  for update;

  select * into option_record
  from public.poll_options option
  where option.id = requested_option_id
    and option.poll_id = requested_poll_id
    and option.organisation_id = requested_organisation_id;

  select membership.id into acting_membership_id
  from public.memberships membership
  where membership.organisation_id = requested_organisation_id
    and membership.user_id = auth.uid()
    and membership.status = 'active';

  if poll_record.conversion_idempotency_key is not null then
    if poll_record.conversion_idempotency_key = requested_idempotency_key
      and poll_record.converted_option_id = requested_option_id
      and public.can_access_team(requested_organisation_id, poll_record.team_id, 'polls:manage') then
      return poll_record.converted_series_id;
    end if;
    raise exception 'Poll has already been converted';
  end if;

  if poll_record.id is null or option_record.id is null or acting_membership_id is null
    or poll_record.status <> 'open'
    or not public.can_access_team(requested_organisation_id, poll_record.team_id, 'polls:manage') then
    raise insufficient_privilege using message = 'Poll conversion is not authorised';
  end if;

  insert into public.events (
    organisation_id, team_id, kind, title, created_by_membership_id
  ) values (
    requested_organisation_id, poll_record.team_id, 'training', poll_record.title, acting_membership_id
  ) returning id into created_event_id;

  insert into public.event_series (
    organisation_id, event_id, team_id, time_zone, recurrence_rule, starts_at, ends_at
  ) values (
    requested_organisation_id, created_event_id, poll_record.team_id, 'Europe/London',
    '{"frequency":"once"}'::jsonb, option_record.starts_at, option_record.ends_at
  ) returning id into created_series_id;

  insert into public.event_instances (
    organisation_id, event_id, series_id, team_id, starts_at, ends_at, status
  ) values (
    requested_organisation_id, created_event_id, created_series_id, poll_record.team_id,
    option_record.starts_at, option_record.ends_at, 'scheduled'
  );

  update public.polls
  set status = 'converted', converted_series_id = created_series_id, converted_option_id = option_record.id,
    conversion_idempotency_key = requested_idempotency_key
  where id = poll_record.id;

  return created_series_id;
end;
$$;

revoke all on function public.convert_poll_to_event_series(uuid, uuid, uuid, text) from public;
grant execute on function public.convert_poll_to_event_series(uuid, uuid, uuid, text) to authenticated;

create function public.edit_recurring_event(
  requested_organisation_id uuid,
  requested_series_id uuid,
  requested_occurrence_starts_at timestamptz,
  requested_scope text,
  requested_patch jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  series_record public.event_series%rowtype;
  occurrence_record public.event_instances%rowtype;
  acting_membership_id uuid;
  replacement_series_id uuid;
  change_id uuid;
  start_shift interval := interval '0 seconds';
  end_shift interval := interval '0 seconds';
begin
  if requested_scope not in ('this', 'this-and-future', 'all')
    or jsonb_typeof(requested_patch) <> 'object'
    or requested_patch = '{}'::jsonb
    or requested_patch - array['title', 'startsAt', 'endsAt', 'locationName', 'status'] <> '{}'::jsonb then
    raise exception 'Recurring event edit is invalid';
  end if;
  if requested_scope <> 'all' and requested_patch ? 'title' then
    raise exception 'Title changes apply to the whole recurring series';
  end if;

  select * into series_record
  from public.event_series series
  where series.id = requested_series_id
    and series.organisation_id = requested_organisation_id
  for update;

  select membership.id into acting_membership_id
  from public.memberships membership
  where membership.organisation_id = requested_organisation_id
    and membership.user_id = auth.uid()
    and membership.status = 'active';

  if series_record.id is null or acting_membership_id is null
    or not public.can_access_team(requested_organisation_id, series_record.team_id, 'events:manage') then
    raise insufficient_privilege using message = 'Recurring event edit is not authorised';
  end if;

  select * into occurrence_record
  from public.event_instances instance
  where instance.organisation_id = requested_organisation_id
    and instance.series_id = requested_series_id
    and instance.starts_at = requested_occurrence_starts_at
  for update;

  if occurrence_record.id is null then
    raise exception 'Recurring event occurrence is not available';
  end if;

  if requested_patch ? 'startsAt' then
    start_shift := (requested_patch->>'startsAt')::timestamptz - occurrence_record.starts_at;
  end if;
  if requested_patch ? 'endsAt' then
    end_shift := (requested_patch->>'endsAt')::timestamptz - occurrence_record.ends_at;
  elsif requested_patch ? 'startsAt' then
    end_shift := start_shift;
  end if;

  if occurrence_record.ends_at + end_shift <= occurrence_record.starts_at + start_shift then
    raise exception 'Recurring event end must be after its start';
  end if;

  if requested_scope = 'this' then
    update public.event_instances instance
    set starts_at = instance.starts_at + start_shift,
        ends_at = instance.ends_at + end_shift,
        location_name = case when requested_patch ? 'locationName' then nullif(requested_patch->>'locationName', '') else instance.location_name end,
        status = case when requested_patch ? 'status' then (requested_patch->>'status')::public.event_status else instance.status end,
        cancelled_reason = case
          when requested_patch->>'status' = 'cancelled' then coalesce(instance.cancelled_reason, 'Cancelled during recurring event edit')
          when requested_patch ? 'status' then null
          else instance.cancelled_reason
        end
    where instance.id = occurrence_record.id;

    insert into public.event_exceptions as existing_exception (
      organisation_id, series_id, team_id, original_starts_at, replacement_instance_id, is_cancelled, patch
    ) values (
      requested_organisation_id, requested_series_id, series_record.team_id,
      requested_occurrence_starts_at, occurrence_record.id, requested_patch->>'status' = 'cancelled', requested_patch
    )
    on conflict (organisation_id, series_id, original_starts_at) do update
    set replacement_instance_id = excluded.replacement_instance_id,
        is_cancelled = excluded.is_cancelled,
        patch = existing_exception.patch || excluded.patch;
  elsif requested_scope = 'this-and-future' then
    insert into public.event_series (
      organisation_id, event_id, team_id, time_zone, recurrence_rule, starts_at, ends_at, until_at
    ) values (
      series_record.organisation_id, series_record.event_id, series_record.team_id, series_record.time_zone,
      series_record.recurrence_rule, occurrence_record.starts_at + start_shift,
      occurrence_record.ends_at + end_shift, series_record.until_at
    ) returning id into replacement_series_id;

    update public.event_series
    set until_at = greatest(starts_at, requested_occurrence_starts_at - interval '1 microsecond')
    where id = requested_series_id;

    update public.event_instances instance
    set series_id = replacement_series_id,
        starts_at = instance.starts_at + start_shift,
        ends_at = instance.ends_at + end_shift,
        location_name = case when requested_patch ? 'locationName' then nullif(requested_patch->>'locationName', '') else instance.location_name end,
        status = case when requested_patch ? 'status' then (requested_patch->>'status')::public.event_status else instance.status end,
        cancelled_reason = case
          when requested_patch->>'status' = 'cancelled' then coalesce(instance.cancelled_reason, 'Cancelled during recurring event edit')
          when requested_patch ? 'status' then null
          else instance.cancelled_reason
        end
    where instance.organisation_id = requested_organisation_id
      and instance.series_id = requested_series_id
      and instance.starts_at >= requested_occurrence_starts_at;
  else
    update public.events event
    set title = case when requested_patch ? 'title' then requested_patch->>'title' else event.title end,
        default_location_name = case when requested_patch ? 'locationName' then nullif(requested_patch->>'locationName', '') else event.default_location_name end
    where event.id = series_record.event_id;

    update public.event_series series
    set starts_at = series.starts_at + start_shift,
        ends_at = series.ends_at + end_shift,
        until_at = case when series.until_at is null then null else series.until_at + start_shift end
    where series.id = requested_series_id;

    update public.event_instances instance
    set starts_at = instance.starts_at + start_shift,
        ends_at = instance.ends_at + end_shift,
        location_name = case when requested_patch ? 'locationName' then nullif(requested_patch->>'locationName', '') else instance.location_name end,
        status = case when requested_patch ? 'status' then (requested_patch->>'status')::public.event_status else instance.status end,
        cancelled_reason = case
          when requested_patch->>'status' = 'cancelled' then coalesce(instance.cancelled_reason, 'Cancelled during recurring event edit')
          when requested_patch ? 'status' then null
          else instance.cancelled_reason
        end
    where instance.organisation_id = requested_organisation_id
      and instance.series_id = requested_series_id;
  end if;

  insert into public.event_change_summaries (
    organisation_id, event_instance_id, team_id, changed_by_membership_id, edit_scope, summary
  ) values (
    requested_organisation_id, occurrence_record.id, series_record.team_id, acting_membership_id,
    requested_scope, jsonb_build_array(jsonb_build_object('patch', requested_patch))
  ) returning id into change_id;

  return change_id;
end;
$$;

revoke all on function public.edit_recurring_event(uuid, uuid, timestamptz, text, jsonb) from public;
grant execute on function public.edit_recurring_event(uuid, uuid, timestamptz, text, jsonb) to authenticated;

create trigger availability_validate_player_team
before insert or update of organisation_id, team_id, player_id, guardian_id on public.availability_responses
for each row execute function public.validate_event_child_team_scope();

create trigger attendance_validate_player_team
before insert or update of organisation_id, team_id, player_id on public.event_attendance
for each row execute function public.validate_event_child_team_scope();
create trigger poll_respondents_validate_player_team
before insert or update of organisation_id, team_id, player_id on public.poll_respondents
for each row when (new.player_id is not null) execute function public.validate_event_child_team_scope();
create trigger squad_members_validate_player_team
before insert or update of organisation_id, team_id, player_id on public.squad_members
for each row execute function public.validate_event_child_team_scope();
create trigger squad_history_validate_player_team
before insert or update of organisation_id, team_id, player_id on public.squad_history
for each row execute function public.validate_event_child_team_scope();
create trigger transport_requests_validate_player_team
before insert or update of organisation_id, team_id, player_id on public.transport_requests
for each row execute function public.validate_event_child_team_scope();

create function public.validate_standby_player_team_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.team_memberships team_member
    where team_member.organisation_id = new.organisation_id
      and team_member.team_id = new.team_id
      and team_member.player_id = new.withdrawn_player_id
      and team_member.status = 'active'
  ) or not exists (
    select 1 from public.team_memberships team_member
    where team_member.organisation_id = new.organisation_id
      and team_member.team_id = new.team_id
      and team_member.player_id = new.standby_player_id
      and team_member.status = 'active'
  ) then
    raise foreign_key_violation using message = 'Standby players must belong to the squad team.';
  end if;
  return new;
end;
$$;

create trigger standby_validate_player_team
before insert or update of organisation_id, team_id, withdrawn_player_id, standby_player_id on public.standby_replacements
for each row execute function public.validate_standby_player_team_scope();

create function public.resolve_private_calendar_token(requested_digest text)
returns table (token_id uuid, organisation_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select token.id, token.organisation_id
  from public.private_calendar_tokens token
  where token.token_digest = requested_digest
    and token.revoked_at is null
    and requested_digest ~ '^[0-9a-f]{64}$';
$$;

revoke all on function public.resolve_private_calendar_token(text) from public;
grant execute on function public.resolve_private_calendar_token(text) to anon, authenticated;

create function public.can_access_poll_respondent(
  requested_organisation_id uuid,
  requested_poll_id uuid,
  requested_respondent_id uuid,
  requested_capability text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.poll_respondents respondent
    join public.polls poll
      on poll.id = respondent.poll_id
      and poll.organisation_id = respondent.organisation_id
    where respondent.id = requested_respondent_id
      and respondent.organisation_id = requested_organisation_id
      and respondent.poll_id = requested_poll_id
      and public.can_access_team(requested_organisation_id, poll.team_id, requested_capability)
      and (
        requested_capability <> 'polls:respond'
        or (poll.status = 'open' and poll.closes_at >= now())
      )
      and (
        requested_capability = 'polls:manage'
        or (
          respondent.membership_id is not null
          and exists (
            select 1 from public.memberships membership
            where membership.id = respondent.membership_id
              and membership.organisation_id = respondent.organisation_id
              and membership.user_id = auth.uid()
              and membership.status = 'active'
          )
        )
        or (
          respondent.player_id is not null
          and public.guardian_can_access_player(respondent.organisation_id, respondent.player_id)
        )
      )
  );
$$;

create function public.private_calendar_events(requested_digest text)
returns table (
  event_id uuid,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  location_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select instance.id, event.title, instance.starts_at, instance.ends_at, instance.location_name
  from public.private_calendar_tokens token
  join public.organisations organisation
    on organisation.id = token.organisation_id
    and organisation.status = 'active'
  join public.memberships membership
    on membership.id = token.membership_id
    and membership.organisation_id = token.organisation_id
    and membership.status = 'active'
  join public.event_instances instance
    on instance.organisation_id = token.organisation_id
    and instance.status = 'scheduled'
  join public.events event
    on event.id = instance.event_id
    and event.organisation_id = instance.organisation_id
    and event.team_id = instance.team_id
  where token.token_digest = requested_digest
    and token.revoked_at is null
    and requested_digest ~ '^[0-9a-f]{64}$'
    and (
      exists (
        select 1
        from public.scoped_role_assignments assignment
        join public.roles role on role.id = assignment.role_id and role.organisation_id = assignment.organisation_id
        join public.role_permissions role_permission on role_permission.role_id = role.id and role_permission.organisation_id = role.organisation_id
        join public.permissions permission on permission.id = role_permission.permission_id
        where assignment.membership_id = membership.id
          and assignment.organisation_id = token.organisation_id
          and permission.key = 'events:view'
          and (
            (assignment.scope_kind = 'organisation' and assignment.scope_id = token.organisation_id and role.key <> 'guardian')
            or (assignment.scope_kind = 'team' and assignment.scope_id = instance.team_id)
          )
      )
      or exists (
        select 1
        from public.guardians guardian
        join public.player_guardians link on link.guardian_id = guardian.id and link.organisation_id = guardian.organisation_id
        join public.team_memberships team_member on team_member.player_id = link.player_id and team_member.organisation_id = link.organisation_id
        where guardian.membership_id = membership.id
          and guardian.organisation_id = token.organisation_id
          and guardian.status = 'active'
          and team_member.team_id = instance.team_id
          and team_member.status = 'active'
      )
    )
  order by instance.starts_at;
$$;

revoke all on function public.private_calendar_events(text) from public;
grant execute on function public.private_calendar_events(text) to anon, authenticated;

create function public.accept_standby_replacement(requested_replacement_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  replacement public.standby_replacements%rowtype;
  responding_membership_id uuid;
  standby_member_id uuid;
  withdrawn_member_id uuid;
begin
  select * into replacement
  from public.standby_replacements candidate
  where candidate.id = requested_replacement_id
  for update;

  if not found or replacement.status <> 'offered' or replacement.expires_at <= now() then
    raise exception 'Standby offer is not available';
  end if;

  select membership.id into responding_membership_id
  from public.memberships membership
  join public.guardians guardian
    on guardian.membership_id = membership.id
    and guardian.organisation_id = membership.organisation_id
  join public.player_guardians link
    on link.guardian_id = guardian.id
    and link.organisation_id = guardian.organisation_id
  where membership.user_id = auth.uid()
    and membership.status = 'active'
    and guardian.status = 'active'
    and membership.organisation_id = replacement.organisation_id
    and link.player_id = replacement.standby_player_id;

  if responding_membership_id is null or not public.can_access_team(
    replacement.organisation_id,
    replacement.team_id,
    'squads:respond'
  ) then
    raise insufficient_privilege using message = 'Standby acceptance is not authorised';
  end if;

  select member.id into standby_member_id
  from public.squad_members member
  where member.squad_id = replacement.squad_id
    and member.organisation_id = replacement.organisation_id
    and member.player_id = replacement.standby_player_id
    and member.status = 'standby'
  for update;

  select member.id into withdrawn_member_id
  from public.squad_members member
  where member.squad_id = replacement.squad_id
    and member.organisation_id = replacement.organisation_id
    and member.player_id = replacement.withdrawn_player_id
    and member.status = 'selected'
  for update;

  if standby_member_id is null or withdrawn_member_id is null then
    raise exception 'Squad places are no longer available';
  end if;

  update public.squad_members set status = 'withdrawn' where id = withdrawn_member_id;
  update public.squad_members set status = 'selected' where id = standby_member_id;
  update public.standby_replacements
  set status = 'accepted', responded_at = now()
  where id = replacement.id;

  insert into public.squad_history (
    organisation_id, squad_id, squad_member_id, team_id, player_id,
    previous_status, next_status, reason, changed_by_membership_id
  ) values
    (replacement.organisation_id, replacement.squad_id, withdrawn_member_id, replacement.team_id,
      replacement.withdrawn_player_id, 'selected', 'withdrawn', 'Standby replacement accepted', responding_membership_id),
    (replacement.organisation_id, replacement.squad_id, standby_member_id, replacement.team_id,
      replacement.standby_player_id, 'standby', 'selected', 'Standby replacement accepted', responding_membership_id);

  return replacement.id;
end;
$$;

revoke all on function public.accept_standby_replacement(uuid) from public;
grant execute on function public.accept_standby_replacement(uuid) to authenticated;

create trigger events_set_updated_at before update on public.events for each row execute function public.set_updated_at();
create trigger event_series_set_updated_at before update on public.event_series for each row execute function public.set_updated_at();
create trigger event_instances_set_updated_at before update on public.event_instances for each row execute function public.set_updated_at();
create trigger availability_set_updated_at before update on public.availability_responses for each row execute function public.set_updated_at();
create trigger polls_set_updated_at before update on public.polls for each row execute function public.set_updated_at();
create trigger squads_set_updated_at before update on public.squads for each row execute function public.set_updated_at();
create trigger squad_members_set_updated_at before update on public.squad_members for each row execute function public.set_updated_at();

alter table public.events enable row level security;
alter table public.event_series enable row level security;
alter table public.event_instances enable row level security;
alter table public.event_exceptions enable row level security;
alter table public.event_change_summaries enable row level security;
alter table public.availability_responses enable row level security;
alter table public.event_attendance enable row level security;
alter table public.event_staff enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_respondents enable row level security;
alter table public.poll_responses enable row level security;
alter table public.squads enable row level security;
alter table public.squad_members enable row level security;
alter table public.squad_history enable row level security;
alter table public.standby_replacements enable row level security;
alter table public.transport_offers enable row level security;
alter table public.transport_requests enable row level security;
alter table public.private_calendar_tokens enable row level security;

create policy events_view_team on public.events for select to authenticated using (public.can_access_team(organisation_id, team_id, 'events:view'));
create policy events_manage_team on public.events for all to authenticated using (public.can_access_team(organisation_id, team_id, 'events:manage')) with check (public.can_access_team(organisation_id, team_id, 'events:manage'));
create policy event_series_view_team on public.event_series for select to authenticated using (public.can_access_team(organisation_id, team_id, 'events:view'));
create policy event_series_manage_team on public.event_series for all to authenticated using (public.can_access_team(organisation_id, team_id, 'events:manage')) with check (public.can_access_team(organisation_id, team_id, 'events:manage'));
create policy event_instances_view_team on public.event_instances for select to authenticated using (public.can_access_team(organisation_id, team_id, 'events:view'));
create policy event_instances_manage_team on public.event_instances for all to authenticated using (public.can_access_team(organisation_id, team_id, 'events:manage')) with check (public.can_access_team(organisation_id, team_id, 'events:manage'));
create policy event_exceptions_manage_team on public.event_exceptions for all to authenticated using (public.can_access_team(organisation_id, team_id, 'events:manage')) with check (public.can_access_team(organisation_id, team_id, 'events:manage'));
create policy event_changes_view_team on public.event_change_summaries for select to authenticated using (public.can_access_team(organisation_id, team_id, 'events:view'));
create policy event_changes_manage_team on public.event_change_summaries for insert to authenticated with check (public.can_access_team(organisation_id, team_id, 'events:manage'));

create policy availability_view_team on public.availability_responses for select to authenticated using (
  public.can_access_team(organisation_id, team_id, 'availability:manage')
  or public.guardian_can_respond_for_player(organisation_id, team_id, player_id, 'availability:respond')
);
create policy availability_respond_linked on public.availability_responses for insert to authenticated with check (
  public.is_current_guardian(organisation_id, guardian_id)
  and public.guardian_can_respond_for_player(organisation_id, team_id, player_id, 'availability:respond')
  and public.availability_response_is_open(organisation_id, event_instance_id)
);
create policy availability_update_linked on public.availability_responses for update to authenticated using (
  public.is_current_guardian(organisation_id, guardian_id)
  and public.guardian_can_respond_for_player(organisation_id, team_id, player_id, 'availability:respond')
  and public.availability_response_is_open(organisation_id, event_instance_id)
) with check (
  public.is_current_guardian(organisation_id, guardian_id)
  and public.guardian_can_respond_for_player(organisation_id, team_id, player_id, 'availability:respond')
  and public.availability_response_is_open(organisation_id, event_instance_id)
);
create policy availability_manage_team on public.availability_responses for all to authenticated using (public.can_access_team(organisation_id, team_id, 'availability:manage')) with check (public.can_access_team(organisation_id, team_id, 'availability:manage'));

create policy attendance_manage_team on public.event_attendance for all to authenticated using (public.can_access_team(organisation_id, team_id, 'attendance:manage')) with check (public.can_access_team(organisation_id, team_id, 'attendance:manage'));
create policy event_staff_view_team on public.event_staff for select to authenticated using (public.can_access_team(organisation_id, team_id, 'events:view'));
create policy event_staff_manage_team on public.event_staff for all to authenticated using (public.can_access_team(organisation_id, team_id, 'events:manage')) with check (public.can_access_team(organisation_id, team_id, 'events:manage'));

create policy polls_view_team on public.polls for select to authenticated using (public.can_access_team(organisation_id, team_id, 'polls:respond') or public.can_access_team(organisation_id, team_id, 'polls:manage'));
create policy polls_manage_team on public.polls for all to authenticated using (public.can_access_team(organisation_id, team_id, 'polls:manage')) with check (public.can_access_team(organisation_id, team_id, 'polls:manage'));
create policy poll_options_view_team on public.poll_options for select to authenticated using (public.can_access_team(organisation_id, team_id, 'polls:respond') or public.can_access_team(organisation_id, team_id, 'polls:manage'));
create policy poll_options_manage_team on public.poll_options for all to authenticated using (public.can_access_team(organisation_id, team_id, 'polls:manage')) with check (public.can_access_team(organisation_id, team_id, 'polls:manage'));
create policy poll_respondents_view_own_or_manage on public.poll_respondents for select to authenticated using (
  public.can_access_poll_respondent(organisation_id, poll_id, id, 'polls:respond')
  or public.can_access_poll_respondent(organisation_id, poll_id, id, 'polls:manage')
);
create policy poll_respondents_manage_team on public.poll_respondents for all to authenticated using (public.can_access_team(organisation_id, team_id, 'polls:manage')) with check (public.can_access_team(organisation_id, team_id, 'polls:manage'));
create policy poll_responses_view_own_or_manage on public.poll_responses for select to authenticated using (
  public.can_access_poll_respondent(organisation_id, poll_id, respondent_id, 'polls:respond')
  or public.can_access_poll_respondent(organisation_id, poll_id, respondent_id, 'polls:manage')
);
create policy poll_responses_respond_own on public.poll_responses for insert to authenticated with check (
  public.can_access_poll_respondent(organisation_id, poll_id, respondent_id, 'polls:respond')
);
create policy poll_responses_update_own on public.poll_responses for update to authenticated using (
  public.can_access_poll_respondent(organisation_id, poll_id, respondent_id, 'polls:respond')
) with check (public.can_access_poll_respondent(organisation_id, poll_id, respondent_id, 'polls:respond'));
create policy poll_responses_manage_team on public.poll_responses for all to authenticated using (
  public.can_access_poll_respondent(organisation_id, poll_id, respondent_id, 'polls:manage')
) with check (public.can_access_poll_respondent(organisation_id, poll_id, respondent_id, 'polls:manage'));

create policy squads_view_team on public.squads for select to authenticated using (public.can_access_team(organisation_id, team_id, 'squads:view') or public.can_access_team(organisation_id, team_id, 'squads:manage'));
create policy squads_manage_team on public.squads for all to authenticated using (public.can_access_team(organisation_id, team_id, 'squads:manage')) with check (public.can_access_team(organisation_id, team_id, 'squads:manage'));
create policy squad_members_view_linked_or_manage on public.squad_members for select to authenticated using (
  public.can_access_team(organisation_id, team_id, 'squads:manage')
  or (public.can_access_team(organisation_id, team_id, 'squads:view') and public.guardian_can_access_player(organisation_id, player_id))
);
create policy squad_members_insert_manage on public.squad_members for insert to authenticated with check (public.can_access_team(organisation_id, team_id, 'squads:manage'));
create policy squad_members_delete_manage on public.squad_members for delete to authenticated using (public.can_access_team(organisation_id, team_id, 'squads:manage'));
create policy squad_history_view_team on public.squad_history for select to authenticated using (public.can_access_team(organisation_id, team_id, 'squads:manage'));
create policy squad_history_insert_team on public.squad_history for insert to authenticated with check (public.can_access_team(organisation_id, team_id, 'squads:manage'));
create policy standby_view_linked_or_manage on public.standby_replacements for select to authenticated using (
  public.can_access_team(organisation_id, team_id, 'squads:manage')
  or (
    public.can_access_team(organisation_id, team_id, 'squads:view')
    and (public.guardian_can_access_player(organisation_id, standby_player_id) or public.guardian_can_access_player(organisation_id, withdrawn_player_id))
  )
);
create policy standby_insert_manage on public.standby_replacements for insert to authenticated with check (public.can_access_team(organisation_id, team_id, 'squads:manage'));
create policy standby_delete_manage on public.standby_replacements for delete to authenticated using (public.can_access_team(organisation_id, team_id, 'squads:manage'));

create policy transport_offers_view_team on public.transport_offers for select to authenticated using (public.can_access_team(organisation_id, team_id, 'events:view'));
create policy transport_offers_guardian on public.transport_offers for all to authenticated using (public.is_current_guardian(organisation_id, guardian_id)) with check (public.is_current_guardian(organisation_id, guardian_id) and public.can_access_team(organisation_id, team_id, 'events:view'));
create policy transport_requests_view_team on public.transport_requests for select to authenticated using (public.can_access_team(organisation_id, team_id, 'events:view'));
create policy transport_requests_guardian on public.transport_requests for all to authenticated using (public.is_current_guardian(organisation_id, guardian_id)) with check (public.is_current_guardian(organisation_id, guardian_id) and public.guardian_can_respond_for_player(organisation_id, team_id, player_id, 'availability:respond'));

create policy calendar_tokens_own on public.private_calendar_tokens for all to authenticated using (
  public.has_capability(organisation_id, 'calendar:manage', 'organisation', organisation_id, null)
  and membership_id in (select membership.id from public.memberships membership where membership.organisation_id = organisation_id and membership.user_id = auth.uid() and membership.status = 'active')
) with check (
  public.has_capability(organisation_id, 'calendar:manage', 'organisation', organisation_id, null)
  and membership_id in (select membership.id from public.memberships membership where membership.organisation_id = organisation_id and membership.user_id = auth.uid() and membership.status = 'active')
);

grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.event_series to authenticated;
grant select, insert, update, delete on public.event_instances to authenticated;
grant select, insert, update, delete on public.event_exceptions to authenticated;
grant select, insert on public.event_change_summaries to authenticated;
grant select, insert, update, delete on public.availability_responses to authenticated;
grant select, insert, update, delete on public.event_attendance to authenticated;
grant select, insert, update, delete on public.event_staff to authenticated;
grant select, insert, update, delete on public.polls to authenticated;
grant select, insert, update, delete on public.poll_options to authenticated;
grant select, insert, update, delete on public.poll_respondents to authenticated;
grant select, insert, update, delete on public.poll_responses to authenticated;
grant select, insert, update, delete on public.squads to authenticated;
grant select, insert, delete on public.squad_members to authenticated;
grant select, insert on public.squad_history to authenticated;
grant select, insert, delete on public.standby_replacements to authenticated;
grant select, insert, update, delete on public.transport_offers to authenticated;
grant select, insert, update, delete on public.transport_requests to authenticated;
grant select, insert, update, delete on public.private_calendar_tokens to authenticated;
