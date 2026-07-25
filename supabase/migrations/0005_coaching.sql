-- Coaching, training and match-day records. Children remain data subjects and never authenticate.
create type public.training_session_status as enum ('draft', 'published', 'completed', 'cancelled');
create type public.attendance_mark as enum ('expected', 'present', 'absent', 'late', 'left-early', 'excused', 'injured', 'observing', 'trialist', 'unknown', 'unexpected');
create type public.development_review_status as enum ('draft', 'approved', 'archived');
create type public.match_state as enum ('ready', 'running', 'paused', 'completed');

insert into public.permissions (key, description)
values
  ('training:manage', 'Manage scoped training plans and drill content'),
  ('matches:manage', 'Manage scoped match-day state and timelines'),
  ('development:manage', 'Manage private player development records and approve parent summaries'),
  ('development:view-approved', 'View approved development summaries for linked children')
on conflict (key) do nothing;

create function public.grant_phase4_role_permissions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.role_permissions (organisation_id, role_id, permission_id)
  select new.organisation_id, new.id, permission.id
  from public.permissions permission
  where
    (new.key in ('owner', 'club-admin') and permission.key in ('training:manage', 'matches:manage', 'development:manage', 'development:view-approved'))
    or (new.key in ('coach', 'manager') and permission.key in ('training:manage', 'matches:manage', 'development:manage'))
    or (new.key = 'guardian' and permission.key = 'development:view-approved')
  on conflict (organisation_id, role_id, permission_id) do nothing;
  return new;
end;
$$;

create trigger roles_grant_phase4_permissions
after insert on public.roles for each row execute function public.grant_phase4_role_permissions();

insert into public.role_permissions (organisation_id, role_id, permission_id)
select role.organisation_id, role.id, permission.id
from public.roles role cross join public.permissions permission
where
  (role.key in ('owner', 'club-admin') and permission.key in ('training:manage', 'matches:manage', 'development:manage', 'development:view-approved'))
  or (role.key in ('coach', 'manager') and permission.key in ('training:manage', 'matches:manage', 'development:manage'))
  or (role.key = 'guardian' and permission.key = 'development:view-approved')
on conflict (organisation_id, role_id, permission_id) do nothing;

create table public.drills (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  title text not null check (length(btrim(title)) between 2 and 120),
  objective text not null check (length(btrim(objective)) between 2 and 500),
  instructions text not null check (length(btrim(instructions)) between 2 and 4000),
  duration_minutes smallint not null check (duration_minutes between 1 and 180),
  minimum_players smallint not null default 1 check (minimum_players between 1 and 40),
  maximum_players smallint check (maximum_players between 1 and 40),
  minimum_age smallint check (minimum_age between 3 and 18),
  maximum_age smallint check (maximum_age between 3 and 18),
  equipment text[] not null default '{}',
  area_description text check (area_description is null or length(area_description) <= 240),
  difficulty text not null default 'adaptable' check (difficulty in ('beginner','developing','challenging','adaptable')),
  adaptations text check (adaptations is null or length(adaptations) <= 1200),
  diagram_url text check (diagram_url is null or diagram_url ~ '^https://'),
  visibility text not null default 'organisation' check (visibility in ('organisation','private')),
  created_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (created_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  unique (id, organisation_id),
  check (maximum_players is null or maximum_players >= minimum_players),
  check (maximum_age is null or minimum_age is null or maximum_age >= minimum_age)
);

create table public.drill_tags (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 40),
  unique (organisation_id, name),
  unique (id, organisation_id)
);

create table public.drill_tag_assignments (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  drill_id uuid not null,
  tag_id uuid not null,
  primary key (organisation_id, drill_id, tag_id),
  foreign key (drill_id, organisation_id) references public.drills(id, organisation_id) on delete cascade,
  foreign key (tag_id, organisation_id) references public.drill_tags(id, organisation_id) on delete cascade
);

create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid not null,
  event_instance_id uuid not null,
  title text not null check (length(btrim(title)) between 2 and 120),
  status public.training_session_status not null default 'draft',
  planned_duration_minutes smallint not null check (planned_duration_minutes between 10 and 240),
  created_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (team_id, organisation_id) references public.teams(id, organisation_id) on delete cascade,
  foreign key (event_instance_id, organisation_id, team_id) references public.event_instances(id, organisation_id, team_id) on delete cascade,
  foreign key (created_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  unique (organisation_id, event_instance_id),
  unique (id, organisation_id),
  unique (id, organisation_id, team_id)
);

create table public.training_segments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid not null,
  training_session_id uuid not null,
  title text not null check (length(btrim(title)) between 2 and 120),
  duration_minutes smallint not null check (duration_minutes between 1 and 180),
  sort_order smallint not null check (sort_order > 0),
  participant_focus text,
  equipment text[] not null default '{}',
  area_description text,
  setup text,
  setup_diagram_url text check (setup_diagram_url is null or setup_diagram_url ~ '^https://'),
  instructions text,
  coaching_points text,
  progression text,
  regression text,
  safety_notes text,
  inclusion_adaptations text,
  goalkeeper_adaptation text,
  coach_notes text,
  created_at timestamptz not null default now(),
  foreign key (training_session_id, organisation_id, team_id) references public.training_sessions(id, organisation_id, team_id) on delete cascade,
  unique (organisation_id, training_session_id, sort_order),
  unique (id, organisation_id)
);

create table public.session_drills (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid not null,
  training_session_id uuid not null,
  drill_id uuid not null,
  duration_minutes smallint not null check (duration_minutes between 1 and 180),
  sort_order smallint not null check (sort_order > 0),
  coaching_points text check (coaching_points is null or length(coaching_points) <= 1000),
  participant_focus text,
  equipment text[] not null default '{}',
  area_description text,
  setup text,
  setup_diagram_url text check (setup_diagram_url is null or setup_diagram_url ~ '^https://'),
  instructions text,
  progression text,
  regression text,
  safety_notes text,
  inclusion_adaptations text,
  goalkeeper_adaptation text,
  coach_notes text,
  created_at timestamptz not null default now(),
  foreign key (training_session_id, organisation_id, team_id) references public.training_sessions(id, organisation_id, team_id) on delete cascade,
  foreign key (drill_id, organisation_id) references public.drills(id, organisation_id) on delete restrict,
  unique (organisation_id, training_session_id, sort_order),
  unique (id, organisation_id)
);

create table public.training_templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid,
  title text not null check (length(btrim(title)) between 2 and 120),
  duration_minutes smallint not null check (duration_minutes between 10 and 240),
  created_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (team_id, organisation_id) references public.teams(id, organisation_id) on delete cascade,
  foreign key (created_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  unique (id, organisation_id)
);

create table public.training_template_items (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  template_id uuid not null,
  drill_id uuid,
  title text not null check (length(btrim(title)) between 2 and 120),
  duration_minutes smallint not null check (duration_minutes between 1 and 180),
  sort_order smallint not null check (sort_order > 0),
  participant_focus text,
  equipment text[] not null default '{}',
  area_description text,
  setup text,
  setup_diagram_url text,
  instructions text,
  coaching_points text,
  progression text,
  regression text,
  safety_notes text,
  inclusion_adaptations text,
  goalkeeper_adaptation text,
  coach_notes text,
  foreign key (template_id, organisation_id) references public.training_templates(id, organisation_id) on delete cascade,
  foreign key (drill_id, organisation_id) references public.drills(id, organisation_id) on delete restrict,
  unique (organisation_id, template_id, sort_order),
  unique (id, organisation_id)
);

create table public.training_attendance (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid not null,
  training_session_id uuid not null,
  player_id uuid not null,
  status public.attendance_mark not null,
  occurred_at timestamptz not null,
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  recorded_by_membership_id uuid not null,
  synced_at timestamptz not null default now(),
  foreign key (training_session_id, organisation_id, team_id) references public.training_sessions(id, organisation_id, team_id) on delete cascade,
  foreign key (player_id, organisation_id) references public.players(id, organisation_id) on delete cascade,
  foreign key (recorded_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  unique (organisation_id, training_session_id, player_id),
  unique (organisation_id, idempotency_key),
  unique (id, organisation_id)
);

create table public.coach_observations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid not null,
  player_id uuid not null,
  author_membership_id uuid not null,
  observation text not null check (length(btrim(observation)) between 2 and 4000),
  context text,
  strength text,
  emerging_skill text,
  opportunity text,
  confidence_engagement text,
  position_code text,
  next_action text,
  training_theme text,
  visibility text not null default 'private' check (visibility in ('private','coaching-staff')),
  follow_up_date date,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (team_id, organisation_id) references public.teams(id, organisation_id) on delete cascade,
  foreign key (player_id, organisation_id) references public.players(id, organisation_id) on delete cascade,
  foreign key (author_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  unique (id, organisation_id),
  unique (id, organisation_id, team_id)
);

create table public.training_guest_attendance (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid not null,
  training_session_id uuid not null,
  attendee_label text not null check (length(btrim(attendee_label)) between 1 and 80),
  status public.attendance_mark not null check (status in ('observing','trialist','unknown','unexpected')),
  occurred_at timestamptz not null,
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  recorded_by_membership_id uuid not null,
  synced_at timestamptz not null default now(),
  foreign key (training_session_id, organisation_id, team_id) references public.training_sessions(id, organisation_id, team_id) on delete cascade,
  foreign key (recorded_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  unique (organisation_id,idempotency_key), unique (id,organisation_id)
);

comment on table public.coach_observations is 'Private coaching notes. Never exposed to guardians, cached offline or sent to AI providers.';

create table public.development_objectives (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid not null,
  player_id uuid not null,
  title text not null check (length(btrim(title)) between 2 and 160),
  status text not null default 'active' check (status in ('active', 'achieved', 'archived')),
  target_date date,
  created_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (team_id, organisation_id) references public.teams(id, organisation_id) on delete cascade,
  foreign key (player_id, organisation_id) references public.players(id, organisation_id) on delete cascade,
  foreign key (created_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  unique (id, organisation_id),
  unique (id, organisation_id, team_id)
);

create table public.development_reviews (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid not null,
  player_id uuid not null,
  status public.development_review_status not null default 'draft',
  private_review text not null check (length(btrim(private_review)) between 2 and 4000),
  reviewed_by_membership_id uuid not null,
  reviewed_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (team_id, organisation_id) references public.teams(id, organisation_id) on delete cascade,
  foreign key (player_id, organisation_id) references public.players(id, organisation_id) on delete cascade,
  foreign key (reviewed_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  unique (id, organisation_id),
  unique (id, organisation_id, team_id, player_id)
);

create table public.parent_development_summaries (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid not null,
  player_id uuid not null,
  review_id uuid not null,
  summary text not null check (length(btrim(summary)) between 2 and 1200),
  current_themes text[] not null default '{}',
  suggested_activities text[] not null default '{}',
  term_review text,
  attendance_summary text,
  approved_by_membership_id uuid not null,
  approved_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (review_id, organisation_id, team_id, player_id) references public.development_reviews(id, organisation_id, team_id, player_id) on delete cascade,
  foreign key (approved_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  unique (organisation_id, review_id),
  unique (id, organisation_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid not null,
  event_instance_id uuid not null,
  state public.match_state not null default 'ready',
  side_size smallint not null default 7 check (side_size between 5 and 11),
  started_at timestamptz,
  state_changed_at timestamptz,
  elapsed_before_ms bigint not null default 0 check (elapsed_before_ms >= 0),
  completed_at timestamptz,
  created_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (event_instance_id, organisation_id, team_id) references public.event_instances(id, organisation_id, team_id) on delete cascade,
  foreign key (created_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  unique (organisation_id, event_instance_id),
  unique (id, organisation_id),
  unique (id, organisation_id, team_id),
  check ((state = 'running' and started_at is not null) or state <> 'running'),
  check ((state = 'completed' and completed_at is not null) or state <> 'completed')
);

create table public.match_periods (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid not null,
  match_id uuid not null,
  period_number smallint not null check (period_number between 1 and 12),
  started_at timestamptz not null,
  ended_at timestamptz,
  foreign key (match_id, organisation_id, team_id) references public.matches(id, organisation_id, team_id) on delete cascade,
  unique (organisation_id, match_id, period_number),
  unique (id, organisation_id),
  unique (id, organisation_id, team_id, match_id),
  check (ended_at is null or ended_at > started_at)
);

create table public.formations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid not null,
  match_id uuid not null,
  name text not null check (length(btrim(name)) between 2 and 60),
  side_size smallint not null check (side_size between 5 and 11),
  created_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (match_id, organisation_id, team_id) references public.matches(id, organisation_id, team_id) on delete cascade,
  foreign key (created_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  unique (id, organisation_id),
  unique (id, organisation_id, team_id)
);

create table public.formation_positions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid not null,
  formation_id uuid not null,
  player_id uuid not null,
  position_code text not null check (position_code in ('GK','LB','CB','RB','LWB','RWB','DM','CM','AM','LW','RW','ST')),
  sort_order smallint not null check (sort_order > 0),
  foreign key (formation_id, organisation_id, team_id) references public.formations(id, organisation_id, team_id) on delete cascade,
  foreign key (player_id, organisation_id) references public.players(id, organisation_id) on delete cascade,
  unique (organisation_id, formation_id, player_id),
  unique (organisation_id, formation_id, sort_order),
  unique (id, organisation_id)
);

create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid not null,
  match_id uuid not null,
  period_id uuid,
  event_type text not null check (event_type in ('state','goal','assist','save','card','substitution','goalkeeper-change','position-change','positive-moment','learning-moment','injury','note','correction')),
  occurred_at timestamptz not null,
  elapsed_ms bigint not null check (elapsed_ms >= 0),
  player_id uuid,
  related_player_id uuid,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  recorded_by_membership_id uuid not null,
  foreign key (match_id, organisation_id, team_id) references public.matches(id, organisation_id, team_id) on delete cascade,
  foreign key (period_id, organisation_id, team_id, match_id) references public.match_periods(id, organisation_id, team_id, match_id) on delete cascade,
  foreign key (player_id, organisation_id) references public.players(id, organisation_id) on delete restrict,
  foreign key (related_player_id, organisation_id) references public.players(id, organisation_id) on delete restrict,
  foreign key (recorded_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  unique (id, organisation_id)
);

create table public.match_position_intervals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid not null,
  match_id uuid not null,
  player_id uuid not null,
  position_code text not null check (position_code in ('GK','LB','CB','RB','LWB','RWB','DM','CM','AM','LW','RW','ST')),
  entered_at timestamptz not null,
  left_at timestamptz,
  recorded_by_membership_id uuid not null,
  foreign key (match_id, organisation_id, team_id) references public.matches(id, organisation_id, team_id) on delete cascade,
  foreign key (player_id, organisation_id) references public.players(id, organisation_id) on delete cascade,
  foreign key (recorded_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  unique (id, organisation_id),
  check (left_at is null or left_at > entered_at)
);

create unique index one_open_position_interval_per_player on public.match_position_intervals (organisation_id, match_id, player_id) where left_at is null;
alter table public.match_position_intervals add constraint match_position_intervals_no_overlap
exclude using gist (
  organisation_id with =,
  match_id with =,
  player_id with =,
  tstzrange(entered_at, coalesce(left_at, 'infinity'::timestamptz), '[)') with &&
);

create table public.playing_time_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid not null,
  match_id uuid not null,
  player_id uuid not null,
  total_minutes numeric(6,2) not null check (total_minutes >= 0),
  goalkeeper_minutes numeric(6,2) not null default 0 check (goalkeeper_minutes >= 0 and goalkeeper_minutes <= total_minutes),
  starter_minutes numeric(6,2) not null default 0 check (starter_minutes >= 0 and starter_minutes <= total_minutes),
  off_pitch_minutes numeric(6,2) not null default 0 check (off_pitch_minutes >= 0),
  position_minutes jsonb not null default '{}'::jsonb check (jsonb_typeof(position_minutes) = 'object'),
  calculated_at timestamptz not null default now(),
  foreign key (match_id, organisation_id, team_id) references public.matches(id, organisation_id, team_id) on delete cascade,
  foreign key (player_id, organisation_id) references public.players(id, organisation_id) on delete cascade,
  unique (organisation_id, match_id, player_id),
  unique (id, organisation_id)
);

create table public.playing_time_corrections (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid not null, match_id uuid not null, player_id uuid not null, adjustment_minutes numeric(6,2) not null check (adjustment_minutes between -240 and 240),
  reason text not null check (length(btrim(reason)) between 5 and 500), recorded_by_membership_id uuid not null, created_at timestamptz not null default now(),
  foreign key (match_id,organisation_id,team_id) references public.matches(id,organisation_id,team_id) on delete cascade,
  foreign key (player_id,organisation_id) references public.players(id,organisation_id) on delete restrict,
  foreign key (recorded_by_membership_id,organisation_id) references public.memberships(id,organisation_id) on delete restrict,
  unique (id,organisation_id)
);

create table public.match_reflections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid not null,
  match_id uuid not null,
  author_membership_id uuid not null,
  private_reflection text not null check (length(btrim(private_reflection)) between 2 and 4000),
  created_at timestamptz not null default now(),
  foreign key (match_id, organisation_id, team_id) references public.matches(id, organisation_id, team_id) on delete cascade,
  foreign key (author_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  unique (id, organisation_id)
);

create table public.parent_match_summaries (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid not null,
  match_id uuid not null,
  summary text not null check (length(btrim(summary)) between 2 and 1200),
  approved_by_membership_id uuid not null,
  approved_at timestamptz not null,
  foreign key (match_id, organisation_id, team_id) references public.matches(id, organisation_id, team_id) on delete cascade,
  foreign key (approved_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  unique (organisation_id, match_id),
  unique (id, organisation_id)
);

create table public.coaching_ai_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid not null,
  requested_by_membership_id uuid not null,
  purpose text not null check (purpose = 'development-summary-draft'),
  model text not null,
  prompt_version text not null,
  schema_version text not null,
  request_hash text not null,
  provider_status text not null check (provider_status in ('ready','refused','unparsed','failed')),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  estimated_cost_gbp numeric(10,6) check (estimated_cost_gbp is null or estimated_cost_gbp >= 0),
  created_at timestamptz not null default now(),
  foreign key (requested_by_membership_id, organisation_id) references public.memberships(id, organisation_id) on delete restrict,
  foreign key (team_id, organisation_id) references public.teams(id, organisation_id) on delete cascade,
  unique (id, organisation_id)
);

comment on table public.coaching_ai_runs is 'Metadata only: no medical, safeguarding, private observations, raw prompts or provider output.';

create index training_sessions_team_time_idx on public.training_sessions (organisation_id, team_id, created_at desc);
create index training_attendance_session_idx on public.training_attendance (organisation_id, training_session_id, occurred_at desc);
create index coach_observations_player_idx on public.coach_observations (organisation_id, team_id, player_id, observed_at desc);
create index development_objectives_player_idx on public.development_objectives (organisation_id, team_id, player_id, status);
create index matches_team_created_idx on public.matches (organisation_id, team_id, created_at desc);
create index match_events_timeline_idx on public.match_events (organisation_id, match_id, occurred_at, id);
create index position_intervals_player_idx on public.match_position_intervals (organisation_id, match_id, player_id, entered_at);

create function public.can_manage_coaching_library(requested_organisation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_capability(requested_organisation_id, 'training:manage', 'organisation', requested_organisation_id, null)
    or exists (
      select 1 from public.teams team
      where team.organisation_id = requested_organisation_id
        and public.can_access_team(requested_organisation_id, team.id, 'training:manage')
    );
$$;

create function public.can_use_coaching_drill(requested_organisation_id uuid, requested_drill_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.drills drill
    where drill.id = requested_drill_id and drill.organisation_id = requested_organisation_id
      and public.can_manage_coaching_library(requested_organisation_id)
      and (drill.visibility = 'organisation' or drill.created_by_membership_id in (
        select membership.id from public.memberships membership where membership.organisation_id = requested_organisation_id and membership.user_id = auth.uid() and membership.status = 'active'
      ))
  );
$$;

create function public.validate_coaching_actor_attribution()
returns trigger language plpgsql set search_path = '' as $$
declare new_data jsonb := to_jsonb(new); old_data jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end; claimed uuid; previous uuid;
begin
  if current_user in ('postgres', 'supabase_admin') then return new; end if;
  claimed := coalesce(
    (new_data ->> 'created_by_membership_id')::uuid,
    (new_data ->> 'author_membership_id')::uuid,
    (new_data ->> 'reviewed_by_membership_id')::uuid,
    (new_data ->> 'approved_by_membership_id')::uuid,
    (new_data ->> 'requested_by_membership_id')::uuid
  );
  previous := coalesce(
    (old_data ->> 'created_by_membership_id')::uuid,
    (old_data ->> 'author_membership_id')::uuid,
    (old_data ->> 'reviewed_by_membership_id')::uuid,
    (old_data ->> 'approved_by_membership_id')::uuid,
    (old_data ->> 'requested_by_membership_id')::uuid
  );
  if claimed is not null and (tg_op = 'INSERT' or claimed is distinct from previous) and not exists (
    select 1 from public.memberships membership
    where membership.id = claimed and membership.organisation_id = new.organisation_id
      and membership.user_id = auth.uid() and membership.status = 'active'
  ) then raise insufficient_privilege using message = 'Actor attribution must use the current active membership.'; end if;
  return new;
end;
$$;

create trigger drills_validate_actor before insert or update on public.drills for each row execute function public.validate_coaching_actor_attribution();
create trigger training_sessions_validate_actor before insert or update on public.training_sessions for each row execute function public.validate_coaching_actor_attribution();
create trigger training_templates_validate_actor before insert or update on public.training_templates for each row execute function public.validate_coaching_actor_attribution();
create trigger coach_observations_validate_actor before insert or update on public.coach_observations for each row execute function public.validate_coaching_actor_attribution();
create trigger development_objectives_validate_actor before insert or update on public.development_objectives for each row execute function public.validate_coaching_actor_attribution();
create trigger development_reviews_validate_actor before insert or update on public.development_reviews for each row execute function public.validate_coaching_actor_attribution();
create trigger parent_development_validate_actor before insert or update on public.parent_development_summaries for each row execute function public.validate_coaching_actor_attribution();
create trigger matches_validate_actor before insert or update on public.matches for each row execute function public.validate_coaching_actor_attribution();
create trigger formations_validate_actor before insert or update on public.formations for each row execute function public.validate_coaching_actor_attribution();
create trigger match_reflections_validate_actor before insert or update on public.match_reflections for each row execute function public.validate_coaching_actor_attribution();
create trigger parent_match_validate_actor before insert or update on public.parent_match_summaries for each row execute function public.validate_coaching_actor_attribution();
create trigger coaching_ai_runs_validate_actor before insert or update on public.coaching_ai_runs for each row execute function public.validate_coaching_actor_attribution();

create function public.validate_coaching_event_kind()
returns trigger language plpgsql set search_path = '' as $$
declare expected_kind public.event_kind; actual_kind public.event_kind;
begin
  expected_kind := case when tg_table_name = 'training_sessions' then 'training'::public.event_kind else 'match'::public.event_kind end;
  select event.kind into actual_kind
  from public.event_instances instance
  join public.events event on event.id = instance.event_id and event.organisation_id = instance.organisation_id and event.team_id = instance.team_id
  where instance.id = new.event_instance_id and instance.organisation_id = new.organisation_id and instance.team_id = new.team_id;
  if actual_kind is distinct from expected_kind then raise foreign_key_violation using message = 'Coaching record must reference the matching canonical event kind.'; end if;
  return new;
end;
$$;
create trigger training_sessions_validate_event before insert or update on public.training_sessions for each row execute function public.validate_coaching_event_kind();
create trigger matches_validate_event before insert or update on public.matches for each row execute function public.validate_coaching_event_kind();

create function public.create_match_day(requested_event_instance_id uuid, requested_side_size smallint)
returns public.matches language plpgsql security definer set search_path = '' as $$
declare instance_record public.event_instances; actor_membership_id uuid; result public.matches;
begin
  perform pg_advisory_xact_lock(hashtextextended(requested_event_instance_id::text, 9));
  select instance.* into instance_record
  from public.event_instances instance
  join public.events event on event.id = instance.event_id and event.organisation_id = instance.organisation_id
  where instance.id = requested_event_instance_id and event.kind = 'match'
  for update of instance;
  if instance_record.id is null or instance_record.status <> 'scheduled' then raise exception 'A scheduled canonical match event is required'; end if;
  if requested_side_size not between 5 and 11 then raise exception 'Match format must be between five and eleven players'; end if;
  if not public.can_access_team(instance_record.organisation_id, instance_record.team_id, 'matches:manage') then raise exception 'Match access denied'; end if;
  select id into actor_membership_id from public.memberships where organisation_id = instance_record.organisation_id and user_id = auth.uid() and status = 'active';
  if actor_membership_id is null then raise exception 'Active membership required'; end if;
  insert into public.matches (organisation_id, team_id, event_instance_id, side_size, created_by_membership_id)
  values (instance_record.organisation_id, instance_record.team_id, instance_record.id, requested_side_size, actor_membership_id)
  on conflict (organisation_id, event_instance_id) do nothing
  returning * into result;
  if result.id is null then raise exception 'This match day already exists'; end if;
  return result;
end;
$$;

create function public.is_match_participant(requested_match_id uuid, requested_player_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.matches match
    where match.id = requested_match_id and (
      exists (
        select 1 from public.squads squad join public.squad_members member
          on member.squad_id = squad.id and member.organisation_id = squad.organisation_id
        where squad.organisation_id = match.organisation_id and squad.event_instance_id = match.event_instance_id
          and squad.status = 'published' and member.player_id = requested_player_id and member.status = 'selected'
      ) or (
        not exists (select 1 from public.squads squad where squad.organisation_id = match.organisation_id and squad.event_instance_id = match.event_instance_id and squad.status = 'published')
        and exists (select 1 from public.team_memberships member where member.organisation_id = match.organisation_id and member.team_id = match.team_id and member.player_id = requested_player_id and member.member_kind = 'player' and member.status = 'active')
      )
    )
  );
$$;

create function public.validate_formation_editable()
returns trigger language plpgsql set search_path = '' as $$
declare requested_match_id uuid; match_status public.match_state;
begin
  if tg_table_name = 'formations' then
    requested_match_id := coalesce(new.match_id, old.match_id);
  else
    select formation.match_id into requested_match_id from public.formations formation where formation.id = coalesce(new.formation_id, old.formation_id) and formation.organisation_id = coalesce(new.organisation_id, old.organisation_id);
  end if;
  select state into match_status from public.matches where id = requested_match_id;
  if match_status is distinct from 'ready'::public.match_state then raise exception 'Formation is locked after match start'; end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
create trigger formations_require_ready_match before insert or update or delete on public.formations for each row execute function public.validate_formation_editable();
create trigger formation_positions_require_ready_match before insert or update or delete on public.formation_positions for each row execute function public.validate_formation_editable();

create function public.enforce_parent_summary_approval()
returns trigger language plpgsql set search_path = '' as $$
declare actor_membership_id uuid;
begin
  select membership.id into actor_membership_id from public.memberships membership
  where membership.organisation_id = new.organisation_id and membership.user_id = auth.uid() and membership.status = 'active';
  if current_user not in ('postgres', 'supabase_admin') then
    if actor_membership_id is null then raise insufficient_privilege using message = 'Active membership required for approval'; end if;
    new.approved_by_membership_id := actor_membership_id;
    new.approved_at := now();
  end if;
  if tg_table_name = 'parent_development_summaries' then
    if not exists (
      select 1 from public.development_reviews review where review.id = new.review_id and review.organisation_id = new.organisation_id and review.team_id = new.team_id and review.player_id = new.player_id and review.status = 'approved'
    ) then raise exception 'Only an approved development review can be shared'; end if;
  end if;
  return new;
end;
$$;
create trigger parent_development_require_approval before insert or update on public.parent_development_summaries for each row execute function public.enforce_parent_summary_approval();
create trigger parent_match_stamp_approval before insert or update on public.parent_match_summaries for each row execute function public.enforce_parent_summary_approval();

create function public.validate_training_plan_totals()
returns trigger language plpgsql set search_path = '' as $$
declare requested_session_id uuid; requested_organisation_id uuid; planned integer; total integer; duplicate_orders integer;
begin
  requested_session_id := coalesce(new.training_session_id, old.training_session_id);
  requested_organisation_id := coalesce(new.organisation_id, old.organisation_id);
  select planned_duration_minutes into planned from public.training_sessions where id = requested_session_id and organisation_id = requested_organisation_id;
  if planned is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  select coalesce(sum(duration_minutes), 0) into total from (
    select duration_minutes from public.training_segments where organisation_id = requested_organisation_id and training_session_id = requested_session_id
    union all
    select duration_minutes from public.session_drills where organisation_id = requested_organisation_id and training_session_id = requested_session_id
  ) items;
  select count(*) - count(distinct sort_order) into duplicate_orders from (
    select sort_order from public.training_segments where organisation_id = requested_organisation_id and training_session_id = requested_session_id
    union all
    select sort_order from public.session_drills where organisation_id = requested_organisation_id and training_session_id = requested_session_id
  ) items;
  if total > planned then raise exception 'Training plan exceeds session duration'; end if;
  if duplicate_orders > 0 then raise exception 'Training plan positions must be unique across segments and drills'; end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create constraint trigger training_segments_validate_plan
after insert or update or delete on public.training_segments deferrable initially deferred
for each row execute function public.validate_training_plan_totals();
create constraint trigger session_drills_validate_plan
after insert or update or delete on public.session_drills deferrable initially deferred
for each row execute function public.validate_training_plan_totals();

create function public.validate_coaching_player_team_scope()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.team_memberships team_member
    where team_member.organisation_id = new.organisation_id
      and team_member.team_id = new.team_id
      and team_member.player_id = new.player_id
      and team_member.member_kind = 'player'
      and team_member.status = 'active'
  ) then raise foreign_key_violation using message = 'Player must be an active member of the coaching team.'; end if;
  return new;
end;
$$;

create trigger training_attendance_validate_player_team before insert or update on public.training_attendance for each row execute function public.validate_coaching_player_team_scope();
create trigger coach_observations_validate_player_team before insert or update on public.coach_observations for each row execute function public.validate_coaching_player_team_scope();
create trigger development_objectives_validate_player_team before insert or update on public.development_objectives for each row execute function public.validate_coaching_player_team_scope();
create trigger development_reviews_validate_player_team before insert or update on public.development_reviews for each row execute function public.validate_coaching_player_team_scope();
create trigger parent_development_validate_player_team before insert or update on public.parent_development_summaries for each row execute function public.validate_coaching_player_team_scope();
create trigger formation_positions_validate_player_team before insert or update on public.formation_positions for each row execute function public.validate_coaching_player_team_scope();
create trigger position_intervals_validate_player_team before insert or update on public.match_position_intervals for each row execute function public.validate_coaching_player_team_scope();
create trigger playing_time_validate_player_team before insert or update on public.playing_time_records for each row execute function public.validate_coaching_player_team_scope();

create function public.record_training_attendance(
  requested_session_id uuid, requested_player_id uuid, requested_status public.attendance_mark,
  requested_occurred_at timestamptz, requested_idempotency_key text
) returns public.training_attendance
language plpgsql security definer set search_path = '' as $$
declare session_record public.training_sessions; actor_membership_id uuid; result public.training_attendance;
begin
  select * into session_record from public.training_sessions where id = requested_session_id for update;
  if session_record.id is null or not public.can_access_team(session_record.organisation_id, session_record.team_id, 'attendance:manage') then raise exception 'Attendance access denied'; end if;
  if requested_occurred_at > clock_timestamp() + interval '5 minutes' or requested_occurred_at < clock_timestamp() - interval '30 days' then raise exception 'Attendance timestamp is outside the offline sync window'; end if;
  select id into actor_membership_id from public.memberships where organisation_id = session_record.organisation_id and user_id = auth.uid() and status = 'active';
  if actor_membership_id is null then raise exception 'Active membership required'; end if;
  insert into public.training_attendance (organisation_id, team_id, training_session_id, player_id, status, occurred_at, idempotency_key, recorded_by_membership_id)
  values (session_record.organisation_id, session_record.team_id, session_record.id, requested_player_id, requested_status, requested_occurred_at, requested_idempotency_key, actor_membership_id)
  on conflict (organisation_id, training_session_id, player_id) do update
  set status = case when excluded.occurred_at >= public.training_attendance.occurred_at then excluded.status else public.training_attendance.status end,
      occurred_at = greatest(excluded.occurred_at, public.training_attendance.occurred_at),
      idempotency_key = case when excluded.occurred_at >= public.training_attendance.occurred_at then excluded.idempotency_key else public.training_attendance.idempotency_key end,
      recorded_by_membership_id = case when excluded.occurred_at >= public.training_attendance.occurred_at then excluded.recorded_by_membership_id else public.training_attendance.recorded_by_membership_id end,
      synced_at = now()
  returning * into result;
  return result;
end;
$$;

create function public.record_training_guest_attendance(requested_session_id uuid, requested_attendee_label text, requested_status public.attendance_mark, requested_occurred_at timestamptz, requested_idempotency_key text)
returns public.training_guest_attendance language plpgsql security definer set search_path = '' as $$
declare session_record public.training_sessions; actor_membership_id uuid; result public.training_guest_attendance;
begin
  select * into session_record from public.training_sessions where id=requested_session_id for update;
  if session_record.id is null or not public.can_access_team(session_record.organisation_id,session_record.team_id,'attendance:manage') then raise exception 'Attendance access denied'; end if;
  if requested_status not in ('observing','trialist','unknown','unexpected') then raise exception 'Guest attendance status required'; end if;
  if requested_occurred_at > clock_timestamp() + interval '5 minutes' or requested_occurred_at < clock_timestamp() - interval '30 days' then raise exception 'Attendance timestamp is outside the offline sync window'; end if;
  select id into actor_membership_id from public.memberships where organisation_id=session_record.organisation_id and user_id=auth.uid() and status='active';
  insert into public.training_guest_attendance (organisation_id,team_id,training_session_id,attendee_label,status,occurred_at,idempotency_key,recorded_by_membership_id)
  values (session_record.organisation_id,session_record.team_id,session_record.id,btrim(requested_attendee_label),requested_status,requested_occurred_at,requested_idempotency_key,actor_membership_id)
  on conflict (organisation_id,idempotency_key) do update set synced_at=clock_timestamp() returning * into result;
  return result;
end;
$$;

create function public.transition_match_state(requested_match_id uuid, requested_state public.match_state, requested_at timestamptz)
returns public.matches language plpgsql security definer set search_path = '' as $$
declare match_record public.matches; actor_membership_id uuid; elapsed bigint; result public.matches; selected_formation_id uuid; next_period smallint;
begin
  perform pg_advisory_xact_lock(hashtextextended(requested_match_id::text, 0));
  -- Match clocks are authoritative on the server. Caller timestamps are never trusted.
  requested_at := clock_timestamp();
  select * into match_record from public.matches where id = requested_match_id for update;
  if match_record.id is null or not public.can_access_team(match_record.organisation_id, match_record.team_id, 'matches:manage') then raise exception 'Match access denied'; end if;
  select id into actor_membership_id from public.memberships where organisation_id = match_record.organisation_id and user_id = auth.uid() and status = 'active';
  if actor_membership_id is null then raise exception 'Active membership required'; end if;
  if requested_at is null then raise exception 'Transition timestamp required'; end if;
  if match_record.state_changed_at is not null and requested_at < match_record.state_changed_at then raise exception 'Match transitions must be chronological'; end if;
  if requested_state = 'ready' then raise exception 'Resetting a match requires a separate audited workflow'; end if;
  if requested_state = 'running' and match_record.state not in ('ready','paused') then raise exception 'Invalid match transition'; end if;
  if requested_state = 'paused' and match_record.state <> 'running' then raise exception 'Invalid match transition'; end if;
  if requested_state = 'completed' and match_record.state not in ('running','paused') then raise exception 'Invalid match transition'; end if;
  if requested_state = 'running' and match_record.state = 'ready' then
    select formation.id into selected_formation_id from public.formations formation
    where formation.match_id = match_record.id and formation.organisation_id = match_record.organisation_id
      and (select count(*) from public.formation_positions position where position.formation_id = formation.id and position.organisation_id = formation.organisation_id) = formation.side_size
      and (select count(*) from public.formation_positions position where position.formation_id = formation.id and position.organisation_id = formation.organisation_id and position.position_code = 'GK') = 1
    order by formation.created_at desc limit 1;
    if selected_formation_id is null then raise exception 'A complete formation with exactly one goalkeeper is required'; end if;
  end if;
  elapsed := match_record.elapsed_before_ms;
  if match_record.state = 'running' then elapsed := elapsed + greatest(0, floor(extract(epoch from (requested_at - match_record.started_at)) * 1000))::bigint; end if;
  update public.matches set state = requested_state,
    started_at = case when requested_state = 'running' then requested_at else null end,
    elapsed_before_ms = elapsed, state_changed_at = requested_at,
    completed_at = case when requested_state = 'completed' then requested_at else null end
  where id = match_record.id returning * into result;
  if requested_state = 'running' and match_record.state = 'ready' then
    insert into public.match_periods (organisation_id, team_id, match_id, period_number, started_at)
    values (result.organisation_id, result.team_id, result.id, 1, requested_at);
    insert into public.match_position_intervals (organisation_id, team_id, match_id, player_id, position_code, entered_at, recorded_by_membership_id)
    select result.organisation_id, result.team_id, result.id, position.player_id, position.position_code, requested_at, actor_membership_id
    from public.formation_positions position where position.formation_id = selected_formation_id and position.organisation_id = result.organisation_id;
  elsif requested_state = 'running' and match_record.state = 'paused' then
    select coalesce(max(period_number), 0) + 1 into next_period from public.match_periods where match_id = result.id and organisation_id = result.organisation_id;
    insert into public.match_periods (organisation_id, team_id, match_id, period_number, started_at)
    values (result.organisation_id, result.team_id, result.id, next_period, requested_at);
    insert into public.match_position_intervals (organisation_id, team_id, match_id, player_id, position_code, entered_at, recorded_by_membership_id)
    select result.organisation_id, result.team_id, result.id, prior.player_id, prior.position_code, requested_at, actor_membership_id
    from (
      select distinct on (interval.player_id) interval.player_id, interval.position_code
      from public.match_position_intervals interval
      where interval.match_id = result.id and interval.organisation_id = result.organisation_id and interval.left_at = match_record.state_changed_at
      order by interval.player_id, interval.left_at desc
    ) prior;
  elsif requested_state = 'paused' then
    update public.match_periods set ended_at = requested_at where match_id = result.id and organisation_id = result.organisation_id and ended_at is null;
    update public.match_position_intervals set left_at = requested_at where match_id = result.id and organisation_id = result.organisation_id and left_at is null;
  elsif requested_state = 'completed' then
    update public.match_periods set ended_at = requested_at where match_id = result.id and organisation_id = result.organisation_id and ended_at is null;
    update public.match_position_intervals set left_at = requested_at where match_id = result.id and organisation_id = result.organisation_id and left_at is null;
    insert into public.playing_time_records (organisation_id, team_id, match_id, player_id, total_minutes, goalkeeper_minutes, calculated_at)
    with participants as (
      select member.player_id from public.squads squad join public.squad_members member
        on member.squad_id = squad.id and member.organisation_id = squad.organisation_id
      where squad.organisation_id = result.organisation_id and squad.event_instance_id = result.event_instance_id
        and squad.status = 'published' and member.status = 'selected'
      union
      select member.player_id from public.team_memberships member
      where member.organisation_id = result.organisation_id and member.team_id = result.team_id and member.member_kind = 'player' and member.status = 'active'
        and not exists (select 1 from public.squads squad where squad.organisation_id = result.organisation_id and squad.event_instance_id = result.event_instance_id and squad.status = 'published')
    )
    select result.organisation_id, result.team_id, result.id, participant.player_id,
      coalesce(round((sum(extract(epoch from (interval.left_at - interval.entered_at))) / 60.0)::numeric, 2), 0),
      coalesce(round((sum(case when interval.position_code = 'GK' then extract(epoch from (interval.left_at - interval.entered_at)) else 0 end) / 60.0)::numeric, 2), 0),
      requested_at
    from participants participant
    left join public.match_position_intervals interval on interval.match_id = result.id and interval.organisation_id = result.organisation_id and interval.player_id = participant.player_id and interval.left_at is not null
    group by participant.player_id
    on conflict (organisation_id, match_id, player_id) do update set total_minutes = excluded.total_minutes, goalkeeper_minutes = excluded.goalkeeper_minutes, calculated_at = excluded.calculated_at;
    update public.playing_time_records record set
      starter_minutes = case when exists (
        select 1 from public.match_position_intervals interval
        where interval.match_id = result.id and interval.player_id = record.player_id
          and interval.entered_at = (select min(period.started_at) from public.match_periods period where period.match_id = result.id)
      ) then record.total_minutes else 0 end,
      off_pitch_minutes = greatest(0, round((elapsed/60000.0)::numeric,2)-record.total_minutes),
      position_minutes = coalesce((select jsonb_object_agg(position_code,minutes) from (select interval.position_code,round((sum(extract(epoch from (interval.left_at-interval.entered_at)))/60.0)::numeric,2) minutes from public.match_position_intervals interval where interval.match_id=result.id and interval.player_id=record.player_id and interval.left_at is not null group by interval.position_code) positions),'{}'::jsonb)
    where record.match_id=result.id and record.organisation_id=result.organisation_id;
  end if;
  insert into public.match_events (organisation_id, team_id, match_id, event_type, occurred_at, elapsed_ms, payload, recorded_by_membership_id)
  values (result.organisation_id, result.team_id, result.id, 'state', requested_at, elapsed, jsonb_build_object('from', match_record.state, 'to', requested_state), actor_membership_id);
  return result;
end;
$$;

create function public.record_playing_time_correction(requested_match_id uuid, requested_player_id uuid, requested_adjustment_minutes numeric, requested_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare match_record public.matches; actor_membership_id uuid; created_id uuid; effective_minutes numeric;
begin
  select * into match_record from public.matches where id=requested_match_id;
  if match_record.id is null or match_record.state <> 'completed' or not public.can_access_team(match_record.organisation_id,match_record.team_id,'matches:manage') then raise exception 'Completed match access required'; end if;
  if not exists (select 1 from public.playing_time_records where match_id=match_record.id and player_id=requested_player_id) then raise exception 'Playing-time record required'; end if;
  select record.total_minutes + coalesce(sum(correction.adjustment_minutes), 0) + requested_adjustment_minutes into effective_minutes
  from public.playing_time_records record left join public.playing_time_corrections correction
    on correction.match_id = record.match_id and correction.player_id = record.player_id
  where record.match_id = match_record.id and record.player_id = requested_player_id
  group by record.total_minutes;
  if effective_minutes < 0 or effective_minutes > round((match_record.elapsed_before_ms / 60000.0)::numeric, 2) then raise exception 'Corrected playing time must remain within the completed match duration'; end if;
  if requested_adjustment_minutes = 0 then raise exception 'A correction must change the recorded total'; end if;
  select id into actor_membership_id from public.memberships where organisation_id=match_record.organisation_id and user_id=auth.uid() and status='active';
  insert into public.playing_time_corrections (organisation_id,team_id,match_id,player_id,adjustment_minutes,reason,recorded_by_membership_id)
  values (match_record.organisation_id,match_record.team_id,match_record.id,requested_player_id,requested_adjustment_minutes,btrim(requested_reason),actor_membership_id) returning id into created_id;
  return created_id;
end;
$$;

create function public.record_match_substitution(
  requested_match_id uuid, outgoing_player_id uuid, incoming_player_id uuid,
  incoming_position text, requested_at timestamptz
) returns public.match_events language plpgsql security definer set search_path = '' as $$
declare match_record public.matches; actor_membership_id uuid; elapsed bigint; result public.match_events; outgoing_position text;
begin
  perform pg_advisory_xact_lock(hashtextextended(requested_match_id::text, 1));
  requested_at := clock_timestamp();
  select * into match_record from public.matches where id = requested_match_id for update;
  if match_record.id is null or match_record.state <> 'running' or not public.can_access_team(match_record.organisation_id, match_record.team_id, 'matches:manage') then raise exception 'Running match access required'; end if;
  if outgoing_player_id = incoming_player_id then raise exception 'Substitution players must differ'; end if;
  if requested_at < match_record.started_at then raise exception 'Substitution timestamp precedes the running period'; end if;
  if incoming_position not in ('GK','LB','CB','RB','LWB','RWB','DM','CM','AM','LW','RW','ST') then raise exception 'Invalid position'; end if;
  if not public.is_match_participant(match_record.id, incoming_player_id) then raise exception 'Incoming player is not selected for this match'; end if;
  select id into actor_membership_id from public.memberships where organisation_id = match_record.organisation_id and user_id = auth.uid() and status = 'active';
  if actor_membership_id is null then raise exception 'Active membership required'; end if;
  elapsed := match_record.elapsed_before_ms + greatest(0, floor(extract(epoch from (requested_at - match_record.started_at)) * 1000))::bigint;
  select position_code into outgoing_position from public.match_position_intervals where organisation_id = match_record.organisation_id and match_id = match_record.id and player_id = outgoing_player_id and left_at is null for update;
  if outgoing_position is null then raise exception 'Outgoing player is not on the pitch'; end if;
  if (outgoing_position = 'GK' and incoming_position <> 'GK') or (outgoing_position <> 'GK' and incoming_position = 'GK') then raise exception 'A substitution must preserve exactly one goalkeeper'; end if;
  update public.match_position_intervals set left_at = requested_at where organisation_id = match_record.organisation_id and match_id = match_record.id and player_id = outgoing_player_id and left_at is null;
  if exists (select 1 from public.match_position_intervals where organisation_id = match_record.organisation_id and match_id = match_record.id and player_id = incoming_player_id and left_at is null) then raise exception 'Incoming player is already on the pitch'; end if;
  insert into public.match_position_intervals (organisation_id, team_id, match_id, player_id, position_code, entered_at, recorded_by_membership_id)
  values (match_record.organisation_id, match_record.team_id, match_record.id, incoming_player_id, incoming_position, requested_at, actor_membership_id);
  insert into public.match_events (organisation_id, team_id, match_id, event_type, occurred_at, elapsed_ms, player_id, related_player_id, payload, recorded_by_membership_id)
  values (match_record.organisation_id, match_record.team_id, match_record.id, case when incoming_position = 'GK' then 'goalkeeper-change' else 'substitution' end, requested_at, elapsed, incoming_player_id, outgoing_player_id, jsonb_build_object('position', incoming_position), actor_membership_id)
  returning * into result;
  return result;
end;
$$;

create function public.record_match_event(requested_match_id uuid, requested_event_type text, requested_player_id uuid, requested_at timestamptz, requested_payload jsonb default '{}'::jsonb)
returns public.match_events language plpgsql security definer set search_path = '' as $$
declare match_record public.matches; actor_membership_id uuid; elapsed bigint; result public.match_events;
begin
  perform pg_advisory_xact_lock(hashtextextended(requested_match_id::text, 2));
  requested_at := clock_timestamp();
  select * into match_record from public.matches where id = requested_match_id for update;
  if match_record.id is null or match_record.state <> 'running' or not public.can_access_team(match_record.organisation_id, match_record.team_id, 'matches:manage') then raise exception 'Running match access required'; end if;
  if requested_event_type not in ('goal','assist','save','card','positive-moment','learning-moment','injury','note') then raise exception 'Unsupported match event'; end if;
  if requested_at < match_record.started_at then raise exception 'Match event timestamp precedes the running period'; end if;
  if requested_event_type in ('goal','assist','save','card','injury') and requested_player_id is null then raise exception 'This match event requires a player'; end if;
  if requested_player_id is not null and not public.is_match_participant(match_record.id, requested_player_id) then raise exception 'Player is not selected for this match'; end if;
  if jsonb_typeof(requested_payload) <> 'object' then raise exception 'Match event payload must be an object'; end if;
  select id into actor_membership_id from public.memberships where organisation_id = match_record.organisation_id and user_id = auth.uid() and status = 'active';
  if actor_membership_id is null then raise exception 'Active membership required'; end if;
  elapsed := match_record.elapsed_before_ms + greatest(0, floor(extract(epoch from (requested_at - match_record.started_at)) * 1000))::bigint;
  insert into public.match_events (organisation_id, team_id, match_id, event_type, occurred_at, elapsed_ms, player_id, payload, recorded_by_membership_id)
  values (match_record.organisation_id, match_record.team_id, match_record.id, requested_event_type, requested_at, elapsed, requested_player_id, requested_payload, actor_membership_id)
  returning * into result;
  return result;
end;
$$;

create function public.save_match_formation(requested_match_id uuid, requested_name text, requested_slots jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare match_record public.matches; actor_membership_id uuid; formation_id uuid; slot jsonb; slot_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(requested_match_id::text, 3));
  select * into match_record from public.matches where id = requested_match_id for update;
  if match_record.id is null or match_record.state <> 'ready' or not public.can_access_team(match_record.organisation_id, match_record.team_id, 'matches:manage') then raise exception 'Editable match access required'; end if;
  if jsonb_typeof(requested_slots) <> 'array' then raise exception 'Formation slots must be an array'; end if;
  slot_count := jsonb_array_length(requested_slots);
  if slot_count not between 5 and 11 then raise exception 'A formation needs between five and eleven players'; end if;
  if slot_count <> match_record.side_size then raise exception 'Formation size must match the configured match format'; end if;
  if (select count(distinct value->>'playerId') from jsonb_array_elements(requested_slots)) <> slot_count then raise exception 'Formation players must be unique'; end if;
  if (select count(*) from jsonb_array_elements(requested_slots) value where value->>'position' = 'GK') <> 1 then raise exception 'A formation needs exactly one goalkeeper'; end if;
  select id into actor_membership_id from public.memberships where organisation_id = match_record.organisation_id and user_id = auth.uid() and status = 'active';
  if actor_membership_id is null then raise exception 'Active membership required'; end if;
  insert into public.formations (organisation_id, team_id, match_id, name, side_size, created_by_membership_id)
  values (match_record.organisation_id, match_record.team_id, match_record.id, btrim(requested_name), slot_count, actor_membership_id) returning id into formation_id;
  for slot in select value from jsonb_array_elements(requested_slots) loop
    if slot->>'position' not in ('GK','LB','CB','RB','LWB','RWB','DM','CM','AM','LW','RW','ST') then raise exception 'Invalid formation position'; end if;
    if not public.is_match_participant(match_record.id, (slot->>'playerId')::uuid) then raise exception 'Formation player is not selected for this match'; end if;
    insert into public.formation_positions (organisation_id, team_id, formation_id, player_id, position_code, sort_order)
    values (match_record.organisation_id, match_record.team_id, formation_id, (slot->>'playerId')::uuid, slot->>'position', (slot->>'sortOrder')::smallint);
  end loop;
  return formation_id;
end;
$$;

create function public.rotate_match_positions(requested_match_id uuid, requested_first_player_id uuid, requested_second_player_id uuid)
returns public.match_events language plpgsql security definer set search_path = '' as $$
declare match_record public.matches; actor_membership_id uuid; first_position text; second_position text; changed_at timestamptz; elapsed bigint; result public.match_events;
begin
  perform pg_advisory_xact_lock(hashtextextended(requested_match_id::text, 4));
  changed_at := clock_timestamp();
  select * into match_record from public.matches where id = requested_match_id for update;
  if match_record.id is null or match_record.state <> 'running' or not public.can_access_team(match_record.organisation_id, match_record.team_id, 'matches:manage') then raise exception 'Running match access required'; end if;
  if requested_first_player_id = requested_second_player_id then raise exception 'Position rotation players must differ'; end if;
  select position_code into first_position from public.match_position_intervals where match_id = match_record.id and player_id = requested_first_player_id and left_at is null for update;
  select position_code into second_position from public.match_position_intervals where match_id = match_record.id and player_id = requested_second_player_id and left_at is null for update;
  if first_position is null or second_position is null then raise exception 'Both players must be on the pitch'; end if;
  select id into actor_membership_id from public.memberships where organisation_id = match_record.organisation_id and user_id = auth.uid() and status = 'active';
  update public.match_position_intervals set left_at = changed_at where match_id = match_record.id and left_at is null and player_id in (requested_first_player_id, requested_second_player_id);
  insert into public.match_position_intervals (organisation_id, team_id, match_id, player_id, position_code, entered_at, recorded_by_membership_id)
  values (match_record.organisation_id, match_record.team_id, match_record.id, requested_first_player_id, second_position, changed_at, actor_membership_id),
         (match_record.organisation_id, match_record.team_id, match_record.id, requested_second_player_id, first_position, changed_at, actor_membership_id);
  elapsed := match_record.elapsed_before_ms + floor(extract(epoch from (changed_at - match_record.started_at)) * 1000)::bigint;
  insert into public.match_events (organisation_id, team_id, match_id, event_type, occurred_at, elapsed_ms, player_id, related_player_id, payload, recorded_by_membership_id)
  values (match_record.organisation_id, match_record.team_id, match_record.id, case when 'GK' in (first_position, second_position) then 'goalkeeper-change' else 'position-change' end, changed_at, elapsed, requested_first_player_id, requested_second_player_id, jsonb_build_object('from', first_position, 'to', second_position), actor_membership_id) returning * into result;
  return result;
end;
$$;

create function public.correct_match_event(requested_event_id uuid, requested_reason text, requested_patch jsonb)
returns public.match_events language plpgsql security definer set search_path = '' as $$
declare original public.match_events; actor_membership_id uuid; result public.match_events;
begin
  select * into original from public.match_events where id = requested_event_id;
  if original.id is null or not public.can_access_team(original.organisation_id, original.team_id, 'matches:manage') then raise exception 'Match event access denied'; end if;
  if length(btrim(requested_reason)) < 5 or jsonb_typeof(requested_patch) <> 'object' then raise exception 'A correction reason and object patch are required'; end if;
  select id into actor_membership_id from public.memberships where organisation_id = original.organisation_id and user_id = auth.uid() and status = 'active';
  insert into public.match_events (organisation_id, team_id, match_id, event_type, occurred_at, elapsed_ms, player_id, payload, recorded_by_membership_id)
  values (original.organisation_id, original.team_id, original.match_id, 'correction', clock_timestamp(), original.elapsed_ms, original.player_id, jsonb_build_object('originalEventId', original.id, 'reason', btrim(requested_reason), 'patch', requested_patch), actor_membership_id) returning * into result;
  return result;
end;
$$;

create function public.save_match_reflection_and_summary(requested_match_id uuid, requested_private_reflection text, requested_parent_summary text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare match_record public.matches; actor_membership_id uuid; reflection_id uuid;
begin
  select * into match_record from public.matches where id = requested_match_id;
  if match_record.id is null or match_record.state <> 'completed' or not public.can_access_team(match_record.organisation_id, match_record.team_id, 'development:manage') then raise exception 'Completed match development access required'; end if;
  select id into actor_membership_id from public.memberships where organisation_id = match_record.organisation_id and user_id = auth.uid() and status = 'active';
  insert into public.match_reflections (organisation_id, team_id, match_id, author_membership_id, private_reflection)
  values (match_record.organisation_id, match_record.team_id, match_record.id, actor_membership_id, btrim(requested_private_reflection)) returning id into reflection_id;
  insert into public.parent_match_summaries (organisation_id, team_id, match_id, summary, approved_by_membership_id, approved_at)
  values (match_record.organisation_id, match_record.team_id, match_record.id, btrim(requested_parent_summary), actor_membership_id, clock_timestamp())
  on conflict (organisation_id, match_id) do update set summary = excluded.summary, approved_by_membership_id = actor_membership_id, approved_at = clock_timestamp();
  return reflection_id;
end;
$$;

create function public.create_coaching_drill(
  requested_organisation_id uuid, requested_title text, requested_objective text, requested_instructions text,
  requested_duration_minutes smallint, requested_minimum_players smallint, requested_maximum_players smallint,
  requested_minimum_age smallint, requested_maximum_age smallint, requested_equipment text[], requested_area_description text,
  requested_difficulty text, requested_adaptations text, requested_diagram_url text, requested_visibility text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_membership_id uuid; created_id uuid;
begin
  if not public.can_manage_coaching_library(requested_organisation_id) then raise exception 'Drill library access denied'; end if;
  select id into actor_membership_id from public.memberships where organisation_id = requested_organisation_id and user_id = auth.uid() and status = 'active';
  insert into public.drills (organisation_id,title,objective,instructions,duration_minutes,minimum_players,maximum_players,minimum_age,maximum_age,equipment,area_description,difficulty,adaptations,diagram_url,visibility,created_by_membership_id)
  values (requested_organisation_id,btrim(requested_title),btrim(requested_objective),btrim(requested_instructions),requested_duration_minutes,requested_minimum_players,requested_maximum_players,requested_minimum_age,requested_maximum_age,coalesce(requested_equipment,'{}'),nullif(btrim(requested_area_description),''),requested_difficulty,nullif(btrim(requested_adaptations),''),nullif(btrim(requested_diagram_url),''),requested_visibility,actor_membership_id)
  returning id into created_id;
  return created_id;
end;
$$;

create function public.save_training_plan(requested_event_instance_id uuid, requested_title text, requested_duration_minutes smallint, requested_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare instance_record public.event_instances; actor_membership_id uuid; session_id uuid; item jsonb; item_order smallint := 0; item_total integer := 0;
begin
  select instance.* into instance_record from public.event_instances instance join public.events event on event.id = instance.event_id and event.organisation_id = instance.organisation_id where instance.id = requested_event_instance_id and event.kind = 'training';
  if instance_record.id is null or instance_record.status <> 'scheduled' or not public.can_access_team(instance_record.organisation_id, instance_record.team_id, 'training:manage') then raise exception 'Scheduled training event access denied'; end if;
  if jsonb_typeof(requested_items) <> 'array' or jsonb_array_length(requested_items) = 0 then raise exception 'Training plan items are required'; end if;
  select coalesce(sum((value->>'durationMinutes')::integer),0), count(*) into item_total, item_order from jsonb_array_elements(requested_items);
  if item_total > requested_duration_minutes then raise exception 'Training plan exceeds session duration'; end if;
  select id into actor_membership_id from public.memberships where organisation_id = instance_record.organisation_id and user_id = auth.uid() and status = 'active';
  insert into public.training_sessions (organisation_id,team_id,event_instance_id,title,planned_duration_minutes,created_by_membership_id)
  values (instance_record.organisation_id,instance_record.team_id,instance_record.id,btrim(requested_title),requested_duration_minutes,actor_membership_id) returning id into session_id;
  item_order := 0;
  for item in select value from jsonb_array_elements(requested_items) loop
    item_order := item_order + 1;
    if item->>'kind' = 'segment' then
      insert into public.training_segments (organisation_id,team_id,training_session_id,title,duration_minutes,sort_order,participant_focus,equipment,area_description,setup,setup_diagram_url,instructions,coaching_points,progression,regression,safety_notes,inclusion_adaptations,goalkeeper_adaptation,coach_notes)
      values (instance_record.organisation_id,instance_record.team_id,session_id,btrim(item->>'title'),(item->>'durationMinutes')::smallint,item_order,item->>'participantFocus',coalesce(array(select jsonb_array_elements_text(coalesce(item->'equipment','[]'::jsonb))),'{}'),item->>'area',item->>'setup',nullif(item->>'diagramUrl',''),item->>'instructions',item->>'coachingPoints',item->>'progression',item->>'regression',item->>'safety',item->>'inclusion',item->>'goalkeeper',item->>'notes');
    elsif item->>'kind' = 'drill' then
      if not public.can_use_coaching_drill(instance_record.organisation_id, (item->>'drillId')::uuid) then raise exception 'Drill access denied'; end if;
      insert into public.session_drills (organisation_id,team_id,training_session_id,drill_id,duration_minutes,sort_order,coaching_points,participant_focus,equipment,area_description,setup,setup_diagram_url,instructions,progression,regression,safety_notes,inclusion_adaptations,goalkeeper_adaptation,coach_notes)
      values (instance_record.organisation_id,instance_record.team_id,session_id,(item->>'drillId')::uuid,(item->>'durationMinutes')::smallint,item_order,nullif(btrim(item->>'coachingPoints'),''),item->>'participantFocus',coalesce(array(select jsonb_array_elements_text(coalesce(item->'equipment','[]'::jsonb))),'{}'),item->>'area',item->>'setup',nullif(item->>'diagramUrl',''),item->>'instructions',item->>'progression',item->>'regression',item->>'safety',item->>'inclusion',item->>'goalkeeper',item->>'notes');
    else raise exception 'Unsupported training plan item'; end if;
  end loop;
  return session_id;
end;
$$;

create function public.replace_training_plan(requested_session_id uuid, requested_title text, requested_duration_minutes smallint, requested_items jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare session_record public.training_sessions; item jsonb; item_order smallint := 0; item_total integer;
begin
  select * into session_record from public.training_sessions where id = requested_session_id for update;
  if session_record.id is null or not public.can_access_team(session_record.organisation_id,session_record.team_id,'training:manage') then raise exception 'Training plan access denied'; end if;
  if jsonb_typeof(requested_items) <> 'array' or jsonb_array_length(requested_items) = 0 then raise exception 'Training plan items are required'; end if;
  select coalesce(sum((value->>'durationMinutes')::integer),0) into item_total from jsonb_array_elements(requested_items);
  if item_total > requested_duration_minutes then raise exception 'Training plan exceeds session duration'; end if;
  update public.training_sessions set title=btrim(requested_title),planned_duration_minutes=requested_duration_minutes,updated_at=clock_timestamp() where id=session_record.id;
  delete from public.training_segments where training_session_id=session_record.id;
  delete from public.session_drills where training_session_id=session_record.id;
  for item in select value from jsonb_array_elements(requested_items) loop
    item_order := item_order + 1;
    if item->>'kind' = 'segment' then
      insert into public.training_segments (organisation_id,team_id,training_session_id,title,duration_minutes,sort_order,participant_focus,equipment,area_description,setup,setup_diagram_url,instructions,coaching_points,progression,regression,safety_notes,inclusion_adaptations,goalkeeper_adaptation,coach_notes)
      values (session_record.organisation_id,session_record.team_id,session_record.id,btrim(item->>'title'),(item->>'durationMinutes')::smallint,item_order,item->>'participantFocus',coalesce(array(select jsonb_array_elements_text(coalesce(item->'equipment','[]'::jsonb))),'{}'),item->>'area',item->>'setup',nullif(item->>'diagramUrl',''),item->>'instructions',item->>'coachingPoints',item->>'progression',item->>'regression',item->>'safety',item->>'inclusion',item->>'goalkeeper',item->>'notes');
    elsif item->>'kind' = 'drill' then
      if not public.can_use_coaching_drill(session_record.organisation_id,(item->>'drillId')::uuid) then raise exception 'Drill access denied'; end if;
      insert into public.session_drills (organisation_id,team_id,training_session_id,drill_id,duration_minutes,sort_order,coaching_points,participant_focus,equipment,area_description,setup,setup_diagram_url,instructions,progression,regression,safety_notes,inclusion_adaptations,goalkeeper_adaptation,coach_notes)
      values (session_record.organisation_id,session_record.team_id,session_record.id,(item->>'drillId')::uuid,(item->>'durationMinutes')::smallint,item_order,item->>'coachingPoints',item->>'participantFocus',coalesce(array(select jsonb_array_elements_text(coalesce(item->'equipment','[]'::jsonb))),'{}'),item->>'area',item->>'setup',nullif(item->>'diagramUrl',''),item->>'instructions',item->>'progression',item->>'regression',item->>'safety',item->>'inclusion',item->>'goalkeeper',item->>'notes');
    else raise exception 'Unsupported training plan item'; end if;
  end loop;
end;
$$;

create function public.move_training_plan_item(requested_session_id uuid, requested_item_id uuid, requested_item_kind text, requested_direction text)
returns void language plpgsql security definer set search_path = '' as $$
declare session_record public.training_sessions; current_order smallint; neighbour_id uuid; neighbour_kind text; neighbour_order smallint;
begin
  select * into session_record from public.training_sessions where id = requested_session_id for update;
  if session_record.id is null or not public.can_access_team(session_record.organisation_id,session_record.team_id,'training:manage') then raise exception 'Training plan access denied'; end if;
  if requested_item_kind = 'segment' then select sort_order into current_order from public.training_segments where id = requested_item_id and training_session_id = session_record.id;
  elsif requested_item_kind = 'drill' then select sort_order into current_order from public.session_drills where id = requested_item_id and training_session_id = session_record.id;
  else raise exception 'Unsupported training item'; end if;
  select item_id,item_kind,sort_order into neighbour_id,neighbour_kind,neighbour_order from (
    select id item_id,'segment' item_kind,sort_order from public.training_segments where training_session_id = session_record.id
    union all select id,'drill',sort_order from public.session_drills where training_session_id = session_record.id
  ) items where (requested_direction = 'up' and sort_order < current_order) or (requested_direction = 'down' and sort_order > current_order)
  order by case when requested_direction = 'up' then -sort_order else sort_order end limit 1;
  if neighbour_id is null then return; end if;
  if requested_item_kind = 'segment' then update public.training_segments set sort_order = 30000 where id = requested_item_id; else update public.session_drills set sort_order = 30000 where id = requested_item_id; end if;
  if neighbour_kind = 'segment' then update public.training_segments set sort_order = current_order where id = neighbour_id; else update public.session_drills set sort_order = current_order where id = neighbour_id; end if;
  if requested_item_kind = 'segment' then update public.training_segments set sort_order = neighbour_order where id = requested_item_id; else update public.session_drills set sort_order = neighbour_order where id = requested_item_id; end if;
end;
$$;

create function public.create_training_template_from_session(requested_session_id uuid, requested_title text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare session_record public.training_sessions; actor_membership_id uuid; template_id uuid;
begin
  select * into session_record from public.training_sessions where id = requested_session_id;
  if session_record.id is null or not public.can_access_team(session_record.organisation_id,session_record.team_id,'training:manage') then raise exception 'Training plan access denied'; end if;
  select id into actor_membership_id from public.memberships where organisation_id = session_record.organisation_id and user_id = auth.uid() and status = 'active';
  insert into public.training_templates (organisation_id,team_id,title,duration_minutes,created_by_membership_id)
  values (session_record.organisation_id,session_record.team_id,btrim(requested_title),session_record.planned_duration_minutes,actor_membership_id) returning id into template_id;
  insert into public.training_template_items (organisation_id,template_id,drill_id,title,duration_minutes,sort_order,participant_focus,equipment,area_description,setup,setup_diagram_url,instructions,coaching_points,progression,regression,safety_notes,inclusion_adaptations,goalkeeper_adaptation,coach_notes)
  select session_record.organisation_id,template_id,item.drill_id,item.title,item.duration_minutes,item.sort_order,item.participant_focus,item.equipment,item.area_description,item.setup,item.setup_diagram_url,item.instructions,item.coaching_points,item.progression,item.regression,item.safety_notes,item.inclusion_adaptations,item.goalkeeper_adaptation,item.coach_notes from (
    select null::uuid drill_id,title,duration_minutes,sort_order,participant_focus,equipment,area_description,setup,setup_diagram_url,instructions,coaching_points,progression,regression,safety_notes,inclusion_adaptations,goalkeeper_adaptation,coach_notes from public.training_segments where training_session_id = session_record.id
    union all
    select drill.id,drill.title,session_drill.duration_minutes,session_drill.sort_order,session_drill.participant_focus,session_drill.equipment,session_drill.area_description,session_drill.setup,session_drill.setup_diagram_url,session_drill.instructions,session_drill.coaching_points,session_drill.progression,session_drill.regression,session_drill.safety_notes,session_drill.inclusion_adaptations,session_drill.goalkeeper_adaptation,session_drill.coach_notes from public.session_drills session_drill join public.drills drill on drill.id = session_drill.drill_id and drill.organisation_id = session_drill.organisation_id where session_drill.training_session_id = session_record.id
  ) item;
  return template_id;
end;
$$;

create function public.record_coach_observation(requested_team_id uuid, requested_player_id uuid, requested_observation text, requested_context text, requested_strength text, requested_emerging_skill text, requested_opportunity text, requested_confidence_engagement text, requested_position_code text, requested_next_action text, requested_training_theme text, requested_visibility text, requested_follow_up_date date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare team_record public.teams; actor_membership_id uuid; created_id uuid;
begin
  select * into team_record from public.teams where id = requested_team_id;
  if team_record.id is null or not public.can_access_team(team_record.organisation_id,team_record.id,'development:manage') then raise exception 'Development access denied'; end if;
  select id into actor_membership_id from public.memberships where organisation_id = team_record.organisation_id and user_id = auth.uid() and status = 'active';
  insert into public.coach_observations (organisation_id,team_id,player_id,author_membership_id,observation,context,strength,emerging_skill,opportunity,confidence_engagement,position_code,next_action,training_theme,visibility,follow_up_date,observed_at)
  values (team_record.organisation_id,team_record.id,requested_player_id,actor_membership_id,btrim(requested_observation),requested_context,requested_strength,requested_emerging_skill,requested_opportunity,requested_confidence_engagement,requested_position_code,requested_next_action,requested_training_theme,requested_visibility,requested_follow_up_date,clock_timestamp()) returning id into created_id;
  return created_id;
end;
$$;

create function public.create_development_objective(requested_team_id uuid, requested_player_id uuid, requested_title text, requested_target_date date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare team_record public.teams; actor_membership_id uuid; created_id uuid;
begin
  select * into team_record from public.teams where id = requested_team_id;
  if team_record.id is null or not public.can_access_team(team_record.organisation_id,team_record.id,'development:manage') then raise exception 'Development access denied'; end if;
  select id into actor_membership_id from public.memberships where organisation_id = team_record.organisation_id and user_id = auth.uid() and status = 'active';
  insert into public.development_objectives (organisation_id,team_id,player_id,title,target_date,created_by_membership_id)
  values (team_record.organisation_id,team_record.id,requested_player_id,btrim(requested_title),requested_target_date,actor_membership_id) returning id into created_id;
  return created_id;
end;
$$;

create function public.create_development_review(requested_team_id uuid, requested_player_id uuid, requested_private_review text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare team_record public.teams; actor_membership_id uuid; created_id uuid;
begin
  select * into team_record from public.teams where id = requested_team_id;
  if team_record.id is null or not public.can_access_team(team_record.organisation_id,team_record.id,'development:manage') then raise exception 'Development access denied'; end if;
  select id into actor_membership_id from public.memberships where organisation_id = team_record.organisation_id and user_id = auth.uid() and status = 'active';
  insert into public.development_reviews (organisation_id,team_id,player_id,private_review,reviewed_by_membership_id,reviewed_at)
  values (team_record.organisation_id,team_record.id,requested_player_id,btrim(requested_private_review),actor_membership_id,clock_timestamp()) returning id into created_id;
  return created_id;
end;
$$;

create function public.approve_development_summary(requested_review_id uuid, requested_summary text, requested_current_themes text[] default '{}', requested_suggested_activities text[] default '{}', requested_term_review text default null, requested_attendance_summary text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare review_record public.development_reviews; actor_membership_id uuid; created_id uuid;
begin
  select * into review_record from public.development_reviews where id = requested_review_id for update;
  if review_record.id is null or not public.can_access_team(review_record.organisation_id,review_record.team_id,'development:manage') then raise exception 'Development review access denied'; end if;
  select id into actor_membership_id from public.memberships where organisation_id = review_record.organisation_id and user_id = auth.uid() and status = 'active';
  update public.development_reviews set status = 'approved', reviewed_by_membership_id = actor_membership_id, reviewed_at = clock_timestamp() where id = review_record.id;
  insert into public.parent_development_summaries (organisation_id,team_id,player_id,review_id,summary,current_themes,suggested_activities,term_review,attendance_summary,approved_by_membership_id,approved_at)
  values (review_record.organisation_id,review_record.team_id,review_record.player_id,review_record.id,btrim(requested_summary),coalesce(requested_current_themes,'{}'),coalesce(requested_suggested_activities,'{}'),requested_term_review,requested_attendance_summary,actor_membership_id,clock_timestamp())
  on conflict (organisation_id,review_id) do update set summary = excluded.summary,current_themes=excluded.current_themes,suggested_activities=excluded.suggested_activities,term_review=excluded.term_review,attendance_summary=excluded.attendance_summary, approved_by_membership_id = actor_membership_id, approved_at = clock_timestamp()
  returning id into created_id;
  return created_id;
end;
$$;

create function public.log_coach_observation_access(requested_observation_id uuid, requested_reason text)
returns setof public.coach_observations language plpgsql security definer set search_path = '' as $$
declare observation_record public.coach_observations; actor_membership_id uuid;
begin
  select * into observation_record from public.coach_observations where id = requested_observation_id;
  if observation_record.id is null or not public.can_access_team(observation_record.organisation_id, observation_record.team_id, 'development:manage') then raise exception 'Observation access denied'; end if;
  if length(btrim(requested_reason)) < 5 then raise exception 'A meaningful access reason is required'; end if;
  select id into actor_membership_id from public.memberships where organisation_id = observation_record.organisation_id and user_id = auth.uid() and status = 'active';
  if observation_record.visibility = 'private' and observation_record.author_membership_id <> actor_membership_id then raise exception 'Private observation access denied'; end if;
  insert into public.audit_log (organisation_id, actor_membership_id, action, resource_type, resource_id, reason)
  values (observation_record.organisation_id, actor_membership_id, 'coach-observation.read', 'coach_observation', observation_record.id, btrim(requested_reason));
  return next observation_record;
end;
$$;

create function public.list_coach_observations(requested_team_id uuid, requested_reason text)
returns setof public.coach_observations language plpgsql security definer set search_path = '' as $$
declare team_record public.teams; actor_membership_id uuid; observation_record public.coach_observations;
begin
  select * into team_record from public.teams where id = requested_team_id;
  if team_record.id is null or not public.can_access_team(team_record.organisation_id, team_record.id, 'development:manage') then raise exception 'Observation access denied'; end if;
  if length(btrim(requested_reason)) < 5 then raise exception 'A meaningful access reason is required'; end if;
  select id into actor_membership_id from public.memberships where organisation_id = team_record.organisation_id and user_id = auth.uid() and status = 'active';
  for observation_record in select * from public.coach_observations where organisation_id = team_record.organisation_id and team_id = team_record.id
    and (visibility = 'coaching-staff' or author_membership_id = actor_membership_id) order by observed_at desc limit 50 loop
    insert into public.audit_log (organisation_id, actor_membership_id, action, resource_type, resource_id, reason)
    values (team_record.organisation_id, actor_membership_id, 'coach-observation.read', 'coach_observation', observation_record.id, btrim(requested_reason));
    return next observation_record;
  end loop;
end;
$$;

create function public.record_coaching_ai_run(
  requested_actor_user_id uuid, requested_organisation_id uuid, requested_team_id uuid, requested_purpose text,
  requested_model text, requested_prompt_version text, requested_schema_version text,
  requested_request_hash text, requested_provider_status text,
  requested_input_tokens integer default null, requested_output_tokens integer default null,
  requested_estimated_cost_gbp numeric default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_membership_id uuid; created_id uuid;
begin
  -- Executable only by the service role after the user-scoped context RPC succeeds.
  if auth.role() is distinct from 'service_role' then raise insufficient_privilege using message = 'Service role required'; end if;
  select id into actor_membership_id from public.memberships where organisation_id = requested_organisation_id and user_id = requested_actor_user_id and status = 'active';
  if actor_membership_id is null then raise exception 'Active membership required'; end if;
  insert into public.coaching_ai_runs (organisation_id, team_id, requested_by_membership_id, purpose, model, prompt_version, schema_version, request_hash, provider_status, input_tokens, output_tokens, estimated_cost_gbp)
  values (requested_organisation_id, requested_team_id, actor_membership_id, requested_purpose, requested_model, requested_prompt_version, requested_schema_version, requested_request_hash, requested_provider_status, requested_input_tokens, requested_output_tokens, requested_estimated_cost_gbp)
  returning id into created_id;
  return created_id;
end;
$$;

create function public.get_coaching_ai_safe_context(requested_organisation_id uuid, requested_team_id uuid, requested_objective_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_access_team(requested_organisation_id, requested_team_id, 'development:manage') then raise exception 'AI context access denied'; end if;
  select jsonb_build_object(
    'playerDisplayName', player.first_name || ' ' || left(player.last_name, 1) || '.',
    'objective', objective.title,
    'recentSessionThemes', coalesce((
      select jsonb_agg(tag.name order by tag.name) from (
        select distinct drill_tag.name from public.drill_tags drill_tag
        join public.drill_tag_assignments assignment on assignment.tag_id = drill_tag.id and assignment.organisation_id = drill_tag.organisation_id
        join public.session_drills session_drill on session_drill.drill_id = assignment.drill_id and session_drill.organisation_id = assignment.organisation_id
        where session_drill.team_id = requested_team_id and session_drill.organisation_id = requested_organisation_id
        limit 8
      ) tag
    ), '[]'::jsonb)
  ) into result
  from public.development_objectives objective
  join public.players player on player.id = objective.player_id and player.organisation_id = objective.organisation_id
  where objective.id = requested_objective_id and objective.organisation_id = requested_organisation_id and objective.team_id = requested_team_id and objective.status = 'active';
  if result is null then raise exception 'Active development objective not found'; end if;
  return result;
end;
$$;

revoke all on function public.record_training_attendance(uuid, uuid, public.attendance_mark, timestamptz, text) from public;
revoke all on function public.record_training_guest_attendance(uuid, text, public.attendance_mark, timestamptz, text) from public;
revoke all on function public.can_use_coaching_drill(uuid, uuid) from public;
revoke all on function public.transition_match_state(uuid, public.match_state, timestamptz) from public;
revoke all on function public.create_match_day(uuid, smallint) from public;
revoke all on function public.is_match_participant(uuid, uuid) from public;
revoke all on function public.record_match_substitution(uuid, uuid, uuid, text, timestamptz) from public;
revoke all on function public.record_match_event(uuid, text, uuid, timestamptz, jsonb) from public;
revoke all on function public.record_playing_time_correction(uuid, uuid, numeric, text) from public;
revoke all on function public.save_match_formation(uuid, text, jsonb) from public;
revoke all on function public.rotate_match_positions(uuid, uuid, uuid) from public;
revoke all on function public.correct_match_event(uuid, text, jsonb) from public;
revoke all on function public.save_match_reflection_and_summary(uuid, text, text) from public;
revoke all on function public.create_coaching_drill(uuid, text, text, text, smallint, smallint, smallint, smallint, smallint, text[], text, text, text, text, text) from public;
revoke all on function public.save_training_plan(uuid, text, smallint, jsonb) from public;
revoke all on function public.replace_training_plan(uuid, text, smallint, jsonb) from public;
revoke all on function public.move_training_plan_item(uuid, uuid, text, text) from public;
revoke all on function public.create_training_template_from_session(uuid, text) from public;
revoke all on function public.record_coach_observation(uuid, uuid, text, text, text, text, text, text, text, text, text, text, date) from public;
revoke all on function public.create_development_objective(uuid, uuid, text, date) from public;
revoke all on function public.create_development_review(uuid, uuid, text) from public;
revoke all on function public.approve_development_summary(uuid, text, text[], text[], text, text) from public;
revoke all on function public.log_coach_observation_access(uuid, text) from public;
revoke all on function public.list_coach_observations(uuid, text) from public;
revoke all on function public.record_coaching_ai_run(uuid, uuid, uuid, text, text, text, text, text, text, integer, integer, numeric) from public;
revoke all on function public.get_coaching_ai_safe_context(uuid, uuid, uuid) from public;
grant execute on function public.record_training_attendance(uuid, uuid, public.attendance_mark, timestamptz, text) to authenticated;
grant execute on function public.record_training_guest_attendance(uuid, text, public.attendance_mark, timestamptz, text) to authenticated;
grant execute on function public.can_use_coaching_drill(uuid, uuid) to authenticated;
grant execute on function public.transition_match_state(uuid, public.match_state, timestamptz) to authenticated;
grant execute on function public.create_match_day(uuid, smallint) to authenticated;
grant execute on function public.record_match_substitution(uuid, uuid, uuid, text, timestamptz) to authenticated;
grant execute on function public.record_match_event(uuid, text, uuid, timestamptz, jsonb) to authenticated;
grant execute on function public.record_playing_time_correction(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.save_match_formation(uuid, text, jsonb) to authenticated;
grant execute on function public.rotate_match_positions(uuid, uuid, uuid) to authenticated;
grant execute on function public.correct_match_event(uuid, text, jsonb) to authenticated;
grant execute on function public.save_match_reflection_and_summary(uuid, text, text) to authenticated;
grant execute on function public.create_coaching_drill(uuid, text, text, text, smallint, smallint, smallint, smallint, smallint, text[], text, text, text, text, text) to authenticated;
grant execute on function public.save_training_plan(uuid, text, smallint, jsonb) to authenticated;
grant execute on function public.replace_training_plan(uuid, text, smallint, jsonb) to authenticated;
grant execute on function public.move_training_plan_item(uuid, uuid, text, text) to authenticated;
grant execute on function public.create_training_template_from_session(uuid, text) to authenticated;
grant execute on function public.record_coach_observation(uuid, uuid, text, text, text, text, text, text, text, text, text, text, date) to authenticated;
grant execute on function public.create_development_objective(uuid, uuid, text, date) to authenticated;
grant execute on function public.create_development_review(uuid, uuid, text) to authenticated;
grant execute on function public.approve_development_summary(uuid, text, text[], text[], text, text) to authenticated;
grant execute on function public.log_coach_observation_access(uuid, text) to authenticated;
grant execute on function public.list_coach_observations(uuid, text) to authenticated;
grant execute on function public.record_coaching_ai_run(uuid, uuid, uuid, text, text, text, text, text, text, integer, integer, numeric) to service_role;
grant execute on function public.get_coaching_ai_safe_context(uuid, uuid, uuid) to authenticated;

create function public.is_approved_development_review(
  requested_organisation_id uuid,
  requested_review_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.development_reviews review
    where review.organisation_id = requested_organisation_id
      and review.id = requested_review_id
      and review.status = 'approved'
  );
$$;

revoke all on function public.is_approved_development_review(uuid, uuid) from public;
grant execute on function public.is_approved_development_review(uuid, uuid) to authenticated;

alter table public.drills enable row level security;
alter table public.drill_tags enable row level security;
alter table public.drill_tag_assignments enable row level security;
alter table public.training_sessions enable row level security;
alter table public.training_segments enable row level security;
alter table public.session_drills enable row level security;
alter table public.training_templates enable row level security;
alter table public.training_template_items enable row level security;
alter table public.training_attendance enable row level security;
alter table public.coach_observations enable row level security;
alter table public.training_guest_attendance enable row level security;
alter table public.development_objectives enable row level security;
alter table public.development_reviews enable row level security;
alter table public.parent_development_summaries enable row level security;
alter table public.matches enable row level security;
alter table public.match_periods enable row level security;
alter table public.formations enable row level security;
alter table public.formation_positions enable row level security;
alter table public.match_events enable row level security;
alter table public.match_position_intervals enable row level security;
alter table public.playing_time_records enable row level security;
alter table public.playing_time_corrections enable row level security;
alter table public.match_reflections enable row level security;
alter table public.parent_match_summaries enable row level security;
alter table public.coaching_ai_runs enable row level security;

create policy drills_manage on public.drills for all to authenticated using (
  public.can_manage_coaching_library(organisation_id)
  and (visibility = 'organisation' or created_by_membership_id in (select membership.id from public.memberships membership where membership.organisation_id = drills.organisation_id and membership.user_id = auth.uid() and membership.status = 'active'))
) with check (
  public.can_manage_coaching_library(organisation_id)
  and created_by_membership_id in (select membership.id from public.memberships membership where membership.organisation_id = drills.organisation_id and membership.user_id = auth.uid() and membership.status = 'active')
);
create policy drill_tags_manage on public.drill_tags for all to authenticated using (public.can_manage_coaching_library(organisation_id)) with check (public.can_manage_coaching_library(organisation_id));
create policy drill_tag_assignments_manage on public.drill_tag_assignments for all to authenticated using (public.can_use_coaching_drill(organisation_id, drill_id)) with check (public.can_use_coaching_drill(organisation_id, drill_id));
create policy training_sessions_team on public.training_sessions for all to authenticated using (public.can_access_team(organisation_id, team_id, 'training:manage')) with check (public.can_access_team(organisation_id, team_id, 'training:manage'));
create policy training_segments_team on public.training_segments for all to authenticated using (public.can_access_team(organisation_id, team_id, 'training:manage')) with check (public.can_access_team(organisation_id, team_id, 'training:manage'));
create policy session_drills_team on public.session_drills for all to authenticated using (public.can_access_team(organisation_id, team_id, 'training:manage') and public.can_use_coaching_drill(organisation_id, drill_id)) with check (public.can_access_team(organisation_id, team_id, 'training:manage') and public.can_use_coaching_drill(organisation_id, drill_id));
create policy training_templates_manage on public.training_templates for all to authenticated using (public.can_manage_coaching_library(organisation_id)) with check (public.can_manage_coaching_library(organisation_id));
create policy template_items_manage on public.training_template_items for all to authenticated using (public.can_manage_coaching_library(organisation_id) and (drill_id is null or public.can_use_coaching_drill(organisation_id, drill_id))) with check (public.can_manage_coaching_library(organisation_id) and (drill_id is null or public.can_use_coaching_drill(organisation_id, drill_id)));
create policy training_attendance_view on public.training_attendance for select to authenticated using (public.can_access_team(organisation_id, team_id, 'attendance:manage'));
create policy training_guest_attendance_view on public.training_guest_attendance for select to authenticated using (public.can_access_team(organisation_id, team_id, 'attendance:manage'));
create policy coach_observations_write on public.coach_observations for insert to authenticated with check (public.can_access_team(organisation_id, team_id, 'development:manage') and author_membership_id in (select membership.id from public.memberships membership where membership.organisation_id = organisation_id and membership.user_id = auth.uid() and membership.status = 'active'));
create policy coach_observations_update on public.coach_observations for update to authenticated using (public.can_access_team(organisation_id, team_id, 'development:manage') and author_membership_id in (select membership.id from public.memberships membership where membership.organisation_id = organisation_id and membership.user_id = auth.uid() and membership.status = 'active')) with check (public.can_access_team(organisation_id, team_id, 'development:manage') and author_membership_id in (select membership.id from public.memberships membership where membership.organisation_id = organisation_id and membership.user_id = auth.uid() and membership.status = 'active'));
create policy coach_observations_delete on public.coach_observations for delete to authenticated using (public.can_access_team(organisation_id, team_id, 'development:manage') and author_membership_id in (select membership.id from public.memberships membership where membership.organisation_id = organisation_id and membership.user_id = auth.uid() and membership.status = 'active'));
create policy objectives_manage on public.development_objectives for all to authenticated using (public.can_access_team(organisation_id, team_id, 'development:manage')) with check (public.can_access_team(organisation_id, team_id, 'development:manage'));
create policy reviews_manage on public.development_reviews for all to authenticated using (public.can_access_team(organisation_id, team_id, 'development:manage')) with check (public.can_access_team(organisation_id, team_id, 'development:manage'));
create policy parent_development_manage on public.parent_development_summaries for all to authenticated using (public.can_access_team(organisation_id, team_id, 'development:manage')) with check (public.can_access_team(organisation_id, team_id, 'development:manage'));
create policy parent_development_linked on public.parent_development_summaries for select to authenticated using (
  public.guardian_can_respond_for_player(organisation_id, team_id, player_id, 'development:view-approved')
  and public.is_approved_development_review(organisation_id, review_id)
);
create policy matches_view on public.matches for select to authenticated using (public.can_access_team(organisation_id, team_id, 'events:view') or public.can_access_team(organisation_id, team_id, 'matches:manage'));
create policy periods_view on public.match_periods for select to authenticated using (public.can_access_team(organisation_id, team_id, 'matches:manage'));
create policy formations_manage on public.formations for all to authenticated using (public.can_access_team(organisation_id, team_id, 'matches:manage')) with check (public.can_access_team(organisation_id, team_id, 'matches:manage'));
create policy formation_positions_manage on public.formation_positions for all to authenticated using (public.can_access_team(organisation_id, team_id, 'matches:manage')) with check (public.can_access_team(organisation_id, team_id, 'matches:manage'));
create policy match_events_view on public.match_events for select to authenticated using (public.can_access_team(organisation_id, team_id, 'matches:manage'));
create policy position_intervals_view on public.match_position_intervals for select to authenticated using (public.can_access_team(organisation_id, team_id, 'matches:manage'));
create policy playing_time_view on public.playing_time_records for select to authenticated using (public.can_access_team(organisation_id, team_id, 'matches:manage'));
create policy playing_time_corrections_view on public.playing_time_corrections for select to authenticated using (public.can_access_team(organisation_id, team_id, 'matches:manage'));
create policy reflections_manage on public.match_reflections for all to authenticated using (public.can_access_team(organisation_id, team_id, 'development:manage')) with check (public.can_access_team(organisation_id, team_id, 'development:manage'));
create policy parent_match_manage on public.parent_match_summaries for all to authenticated using (public.can_access_team(organisation_id, team_id, 'development:manage')) with check (public.can_access_team(organisation_id, team_id, 'development:manage'));
create policy parent_match_linked on public.parent_match_summaries for select to authenticated using (exists (
  select 1 from public.player_guardians link
  join public.team_memberships team_member on team_member.organisation_id = link.organisation_id and team_member.player_id = link.player_id and team_member.member_kind = 'player' and team_member.status = 'active'
  where link.organisation_id = parent_match_summaries.organisation_id and team_member.team_id = parent_match_summaries.team_id and public.is_current_guardian(link.organisation_id, link.guardian_id)
));
create policy ai_runs_view on public.coaching_ai_runs for select to authenticated using (public.can_access_team(organisation_id, team_id, 'development:manage'));

revoke all on public.drills, public.drill_tags, public.drill_tag_assignments, public.training_sessions,
  public.training_segments, public.session_drills, public.training_templates, public.training_template_items,
  public.training_attendance, public.training_guest_attendance, public.coach_observations, public.development_objectives, public.development_reviews,
  public.parent_development_summaries, public.matches, public.match_periods, public.formations,
  public.formation_positions, public.match_events, public.match_position_intervals, public.playing_time_records,
  public.playing_time_corrections,
  public.match_reflections, public.parent_match_summaries, public.coaching_ai_runs from authenticated;

grant select, insert, update, delete on public.development_objectives, public.development_reviews to authenticated;
grant select on public.drills, public.drill_tags, public.drill_tag_assignments, public.training_sessions,
  public.training_segments, public.session_drills, public.training_templates, public.training_template_items,
  public.parent_development_summaries, public.formations, public.formation_positions, public.match_reflections,
  public.parent_match_summaries, public.training_attendance, public.training_guest_attendance, public.matches, public.match_periods, public.match_events,
  public.match_position_intervals, public.playing_time_records, public.playing_time_corrections to authenticated;
grant select on public.coaching_ai_runs to authenticated;
