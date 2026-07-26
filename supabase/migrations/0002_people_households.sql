create type public.team_member_kind as enum ('player', 'coach', 'volunteer');
create type public.team_membership_status as enum ('active', 'inactive');

create table public.age_groups (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 60),
  minimum_age smallint not null check (minimum_age between 3 and 18),
  maximum_age smallint not null check (maximum_age between 3 and 18),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, name),
  unique (id, organisation_id),
  check (maximum_age >= minimum_age)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  season_id uuid not null,
  age_group_id uuid not null,
  name text not null check (length(btrim(name)) between 2 and 100),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (season_id, organisation_id)
    references public.seasons(id, organisation_id) on delete cascade,
  foreign key (age_group_id, organisation_id)
    references public.age_groups(id, organisation_id) on delete restrict,
  unique (organisation_id, season_id, name),
  unique (id, organisation_id)
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  first_name text not null check (length(btrim(first_name)) between 1 and 80),
  last_name text not null check (length(btrim(last_name)) between 1 and 80),
  date_of_birth date not null check (date_of_birth <= current_date),
  status text not null default 'active' check (status in ('active', 'inactive', 'left')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organisation_id)
);

comment on table public.players is
  'Child records only. Players never reference auth.users or profiles.';

create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  membership_id uuid,
  display_name text not null check (length(btrim(display_name)) between 2 and 120),
  email text check (email is null or email = lower(email)),
  status text not null default 'pending' check (status in ('pending', 'active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (membership_id, organisation_id)
    references public.memberships(id, organisation_id) on delete set null (membership_id),
  unique (organisation_id, membership_id),
  unique (organisation_id, email),
  unique (id, organisation_id),
  check (membership_id is not null or email is not null)
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organisation_id)
);

create table public.player_guardians (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  household_id uuid not null,
  player_id uuid not null,
  guardian_id uuid not null,
  relationship text not null check (length(btrim(relationship)) between 2 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, organisation_id)
    references public.households(id, organisation_id) on delete cascade,
  foreign key (player_id, organisation_id)
    references public.players(id, organisation_id) on delete cascade,
  foreign key (guardian_id, organisation_id)
    references public.guardians(id, organisation_id) on delete cascade,
  unique (organisation_id, household_id, player_id, guardian_id),
  unique (id, organisation_id)
);

create table public.guardian_permissions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  player_guardian_id uuid not null,
  communication boolean not null default true,
  payments boolean not null default false,
  consent boolean not null default false,
  emergency_contact boolean not null default false,
  restricted_contact boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (player_guardian_id, organisation_id)
    references public.player_guardians(id, organisation_id) on delete cascade,
  unique (organisation_id, player_guardian_id),
  unique (id, organisation_id)
);

comment on column public.guardian_permissions.restricted_contact is
  'When true, ordinary household queries must not reveal this guardian to another guardian.';

create table public.coaches (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  membership_id uuid not null,
  display_name text not null check (length(btrim(display_name)) between 2 and 120),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (membership_id, organisation_id)
    references public.memberships(id, organisation_id) on delete cascade,
  unique (organisation_id, membership_id),
  unique (id, organisation_id)
);

create table public.volunteers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  membership_id uuid not null,
  display_name text not null check (length(btrim(display_name)) between 2 and 120),
  kind text not null check (length(btrim(kind)) between 2 and 80),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (membership_id, organisation_id)
    references public.memberships(id, organisation_id) on delete cascade,
  unique (organisation_id, membership_id, kind),
  unique (id, organisation_id)
);

create table public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid not null,
  member_kind public.team_member_kind not null,
  player_id uuid,
  coach_id uuid,
  volunteer_id uuid,
  status public.team_membership_status not null default 'active',
  joined_on date,
  left_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (team_id, organisation_id)
    references public.teams(id, organisation_id) on delete cascade,
  foreign key (player_id, organisation_id)
    references public.players(id, organisation_id) on delete cascade,
  foreign key (coach_id, organisation_id)
    references public.coaches(id, organisation_id) on delete cascade,
  foreign key (volunteer_id, organisation_id)
    references public.volunteers(id, organisation_id) on delete cascade,
  unique nulls not distinct (organisation_id, team_id, member_kind, player_id, coach_id, volunteer_id),
  unique (id, organisation_id),
  check (
    (member_kind = 'player' and player_id is not null and coach_id is null and volunteer_id is null)
    or (member_kind = 'coach' and player_id is null and coach_id is not null and volunteer_id is null)
    or (member_kind = 'volunteer' and player_id is null and coach_id is null and volunteer_id is not null)
  ),
  check (left_on is null or joined_on is null or left_on >= joined_on)
);

create table public.opposition_contacts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  club_name text not null check (length(btrim(club_name)) between 2 and 120),
  display_name text not null check (length(btrim(display_name)) between 2 and 120),
  email text check (email is null or email = lower(email)),
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, club_name, display_name),
  unique (id, organisation_id),
  check (email is not null or phone is not null)
);

insert into public.permissions (key, description)
values
  ('household:manage', 'Manage the current guardian household'),
  ('opposition:manage', 'Manage opposition contacts'),
  ('people:manage', 'Manage organisation people and household links'),
  ('players:view', 'View players within an assigned scope'),
  ('team:view', 'View a team within an assigned scope'),
  ('teams:manage', 'Manage organisation teams'),
  ('volunteers:view', 'View volunteers within an assigned scope')
on conflict (key) do nothing;

insert into public.role_permissions (organisation_id, role_id, permission_id)
select role.organisation_id, role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.key = 'owner'
  and permission.key in (
    'household:manage',
    'opposition:manage',
    'people:manage',
    'players:view',
    'team:view',
    'teams:manage',
    'volunteers:view'
  )
on conflict (organisation_id, role_id, permission_id) do nothing;

create index age_groups_organisation_idx on public.age_groups (organisation_id, name);
create index teams_organisation_season_idx on public.teams (organisation_id, season_id, status);
create index players_organisation_name_idx on public.players (organisation_id, last_name, first_name);
create index guardians_organisation_membership_idx on public.guardians (organisation_id, membership_id);
create index households_organisation_idx on public.households (organisation_id);
create index player_guardians_guardian_idx on public.player_guardians (organisation_id, guardian_id, household_id);
create index player_guardians_player_idx on public.player_guardians (organisation_id, player_id, household_id);
create index guardian_permissions_link_idx on public.guardian_permissions (organisation_id, player_guardian_id);
create index coaches_membership_idx on public.coaches (organisation_id, membership_id);
create index volunteers_membership_idx on public.volunteers (organisation_id, membership_id);
create index team_memberships_team_idx on public.team_memberships (organisation_id, team_id, status);
create index team_memberships_player_idx on public.team_memberships (organisation_id, player_id) where player_id is not null;
create index opposition_contacts_organisation_idx on public.opposition_contacts (organisation_id, club_name);

create trigger age_groups_set_updated_at before update on public.age_groups
for each row execute function public.set_updated_at();
create trigger teams_set_updated_at before update on public.teams
for each row execute function public.set_updated_at();
create trigger players_set_updated_at before update on public.players
for each row execute function public.set_updated_at();
create trigger guardians_set_updated_at before update on public.guardians
for each row execute function public.set_updated_at();
create trigger households_set_updated_at before update on public.households
for each row execute function public.set_updated_at();
create trigger player_guardians_set_updated_at before update on public.player_guardians
for each row execute function public.set_updated_at();
create trigger guardian_permissions_set_updated_at before update on public.guardian_permissions
for each row execute function public.set_updated_at();
create trigger coaches_set_updated_at before update on public.coaches
for each row execute function public.set_updated_at();
create trigger volunteers_set_updated_at before update on public.volunteers
for each row execute function public.set_updated_at();
create trigger team_memberships_set_updated_at before update on public.team_memberships
for each row execute function public.set_updated_at();
create trigger opposition_contacts_set_updated_at before update on public.opposition_contacts
for each row execute function public.set_updated_at();

create function public.sync_guardian_membership_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.membership_id is null then
    new.status := 'pending';
  elsif new.status = 'pending' then
    new.status := 'active';
  end if;
  return new;
end;
$$;

create trigger guardians_sync_membership_status
before insert or update of membership_id on public.guardians
for each row execute function public.sync_guardian_membership_status();

create function public.validate_team_scope_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.scope_kind = 'team' and not exists (
    select 1
    from public.teams team
    where team.id = new.scope_id
      and team.organisation_id = new.organisation_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'Team-scoped access must reference a team in the same organisation.';
  end if;
  return new;
end;
$$;

create trigger assignments_validate_team_scope_reference
before insert or update of organisation_id, scope_kind, scope_id
on public.scoped_role_assignments
for each row execute function public.validate_team_scope_reference();

create trigger invites_validate_team_scope_reference
before insert or update of organisation_id, scope_kind, scope_id
on public.organisation_invites
for each row execute function public.validate_team_scope_reference();

create function public.is_current_guardian(
  requested_organisation_id uuid,
  requested_guardian_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.guardians guardian
    join public.memberships membership
      on membership.id = guardian.membership_id
      and membership.organisation_id = guardian.organisation_id
    where guardian.id = requested_guardian_id
      and guardian.organisation_id = requested_organisation_id
      and guardian.status = 'active'
      and membership.user_id = auth.uid()
      and membership.status = 'active'
  );
$$;

create function public.guardian_can_access_household(
  requested_organisation_id uuid,
  requested_household_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.player_guardians link
    join public.guardians guardian
      on guardian.id = link.guardian_id
      and guardian.organisation_id = link.organisation_id
    join public.memberships membership
      on membership.id = guardian.membership_id
      and membership.organisation_id = guardian.organisation_id
    where link.organisation_id = requested_organisation_id
      and link.household_id = requested_household_id
      and guardian.status = 'active'
      and membership.user_id = auth.uid()
      and membership.status = 'active'
  );
$$;

create function public.guardian_can_access_player(
  requested_organisation_id uuid,
  requested_player_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.player_guardians link
    join public.guardians guardian
      on guardian.id = link.guardian_id
      and guardian.organisation_id = link.organisation_id
    join public.memberships membership
      on membership.id = guardian.membership_id
      and membership.organisation_id = guardian.organisation_id
    where link.organisation_id = requested_organisation_id
      and link.player_id = requested_player_id
      and guardian.status = 'active'
      and membership.user_id = auth.uid()
      and membership.status = 'active'
  );
$$;

revoke all on function public.is_current_guardian(uuid, uuid) from public;
revoke all on function public.guardian_can_access_household(uuid, uuid) from public;
revoke all on function public.guardian_can_access_player(uuid, uuid) from public;
grant execute on function public.is_current_guardian(uuid, uuid) to authenticated;
grant execute on function public.guardian_can_access_household(uuid, uuid) to authenticated;
grant execute on function public.guardian_can_access_player(uuid, uuid) to authenticated;

alter table public.age_groups enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.guardians enable row level security;
alter table public.households enable row level security;
alter table public.player_guardians enable row level security;
alter table public.guardian_permissions enable row level security;
alter table public.coaches enable row level security;
alter table public.volunteers enable row level security;
alter table public.team_memberships enable row level security;
alter table public.opposition_contacts enable row level security;

create policy age_groups_select_members on public.age_groups for select to authenticated
using (public.has_active_membership(organisation_id));
create policy age_groups_manage_scoped on public.age_groups for all to authenticated
using (public.has_capability(organisation_id, 'teams:manage', 'organisation', organisation_id, null))
with check (public.has_capability(organisation_id, 'teams:manage', 'organisation', organisation_id, null));

create policy teams_select_members on public.teams for select to authenticated
using (public.has_active_membership(organisation_id));
create policy teams_manage_scoped on public.teams for all to authenticated
using (public.has_capability(organisation_id, 'teams:manage', 'team', id, null))
with check (public.has_capability(organisation_id, 'teams:manage', 'organisation', organisation_id, null));

create policy players_select_linked_or_scoped on public.players for select to authenticated
using (
  public.guardian_can_access_player(organisation_id, id)
  or public.has_capability(organisation_id, 'people:manage', 'organisation', organisation_id, null)
  or exists (
    select 1 from public.team_memberships team_member
    where team_member.organisation_id = players.organisation_id
      and team_member.player_id = players.id
      and public.has_capability(
        players.organisation_id,
        'players:view',
        'team',
        team_member.team_id,
        null
      )
  )
);
create policy players_manage_scoped on public.players for all to authenticated
using (public.has_capability(organisation_id, 'people:manage', 'organisation', organisation_id, null))
with check (public.has_capability(organisation_id, 'people:manage', 'organisation', organisation_id, null));

create policy guardians_select_self_or_scoped on public.guardians for select to authenticated
using (
  public.is_current_guardian(organisation_id, id)
  or public.has_capability(organisation_id, 'people:manage', 'organisation', organisation_id, null)
);
create policy guardians_manage_scoped on public.guardians for all to authenticated
using (public.has_capability(organisation_id, 'people:manage', 'organisation', organisation_id, null))
with check (public.has_capability(organisation_id, 'people:manage', 'organisation', organisation_id, null));

create policy households_select_linked_or_scoped on public.households for select to authenticated
using (
  public.guardian_can_access_household(organisation_id, id)
  or public.has_capability(organisation_id, 'people:manage', 'organisation', organisation_id, null)
);
create policy households_manage_scoped on public.households for all to authenticated
using (public.has_capability(organisation_id, 'people:manage', 'organisation', organisation_id, null))
with check (public.has_capability(organisation_id, 'people:manage', 'organisation', organisation_id, null));

create policy player_guardians_select_own_or_scoped on public.player_guardians for select to authenticated
using (
  public.is_current_guardian(organisation_id, guardian_id)
  or public.has_capability(organisation_id, 'people:manage', 'organisation', organisation_id, null)
);
create policy player_guardians_manage_scoped on public.player_guardians for all to authenticated
using (public.has_capability(organisation_id, 'people:manage', 'organisation', organisation_id, null))
with check (public.has_capability(organisation_id, 'people:manage', 'organisation', organisation_id, null));

create policy guardian_permissions_select_own_or_scoped on public.guardian_permissions for select to authenticated
using (
  exists (
    select 1 from public.player_guardians link
    where link.id = guardian_permissions.player_guardian_id
      and link.organisation_id = guardian_permissions.organisation_id
      and public.is_current_guardian(link.organisation_id, link.guardian_id)
  )
  or public.has_capability(organisation_id, 'people:manage', 'organisation', organisation_id, null)
);
create policy guardian_permissions_manage_scoped on public.guardian_permissions for all to authenticated
using (public.has_capability(organisation_id, 'people:manage', 'organisation', organisation_id, null))
with check (public.has_capability(organisation_id, 'people:manage', 'organisation', organisation_id, null));

create policy coaches_select_members on public.coaches for select to authenticated
using (public.has_active_membership(organisation_id));
create policy coaches_manage_scoped on public.coaches for all to authenticated
using (public.has_capability(organisation_id, 'people:manage', 'organisation', organisation_id, null))
with check (public.has_capability(organisation_id, 'people:manage', 'organisation', organisation_id, null));

create policy volunteers_select_scoped on public.volunteers for select to authenticated
using (
  public.has_capability(organisation_id, 'volunteers:view', 'organisation', organisation_id, null)
  or public.has_capability(organisation_id, 'people:manage', 'organisation', organisation_id, null)
);
create policy volunteers_manage_scoped on public.volunteers for all to authenticated
using (public.has_capability(organisation_id, 'people:manage', 'organisation', organisation_id, null))
with check (public.has_capability(organisation_id, 'people:manage', 'organisation', organisation_id, null));

create policy team_memberships_select_scoped on public.team_memberships for select to authenticated
using (
  public.has_capability(organisation_id, 'team:view', 'team', team_id, null)
  or public.has_capability(organisation_id, 'people:manage', 'organisation', organisation_id, null)
  or (player_id is not null and public.guardian_can_access_player(organisation_id, player_id))
);
create policy team_memberships_manage_scoped on public.team_memberships for all to authenticated
using (public.has_capability(organisation_id, 'teams:manage', 'team', team_id, null))
with check (public.has_capability(organisation_id, 'teams:manage', 'team', team_id, null));

create policy opposition_contacts_scoped on public.opposition_contacts for all to authenticated
using (public.has_capability(organisation_id, 'opposition:manage', 'organisation', organisation_id, null))
with check (public.has_capability(organisation_id, 'opposition:manage', 'organisation', organisation_id, null));

grant select, insert, update, delete on public.age_groups to authenticated;
grant select, insert, update, delete on public.teams to authenticated;
grant select, insert, update, delete on public.players to authenticated;
grant select, insert, update, delete on public.guardians to authenticated;
grant select, insert, update, delete on public.households to authenticated;
grant select, insert, update, delete on public.player_guardians to authenticated;
grant select, insert, update, delete on public.guardian_permissions to authenticated;
grant select, insert, update, delete on public.coaches to authenticated;
grant select, insert, update, delete on public.volunteers to authenticated;
grant select, insert, update, delete on public.team_memberships to authenticated;
grant select, insert, update, delete on public.opposition_contacts to authenticated;
