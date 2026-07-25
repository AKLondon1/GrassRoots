create extension if not exists pgcrypto;

create type public.membership_status as enum (
  'active',
  'invited',
  'suspended',
  'left'
);

create type public.scope_kind as enum (
  'organisation',
  'team',
  'resource'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  account_type text not null default 'adult' check (account_type = 'adult'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.account_type is
  'GrassRoots authenticates adults only. Children are represented by player records in a later migration.';

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.membership_status not null default 'invited',
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, user_id),
  unique (id, organisation_id),
  check ((status = 'active' and joined_at is not null) or status <> 'active')
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9-]*$'),
  name text not null check (length(btrim(name)) between 2 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, key),
  unique (id, organisation_id)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$'),
  description text not null,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  role_id uuid not null,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (role_id, organisation_id)
    references public.roles(id, organisation_id) on delete cascade,
  unique (organisation_id, role_id, permission_id),
  unique (id, organisation_id)
);

create table public.scoped_role_assignments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  membership_id uuid not null,
  role_id uuid not null,
  scope_kind public.scope_kind not null,
  scope_id uuid not null,
  resource_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (membership_id, organisation_id)
    references public.memberships(id, organisation_id) on delete cascade,
  foreign key (role_id, organisation_id)
    references public.roles(id, organisation_id) on delete cascade,
  unique nulls not distinct (
    organisation_id,
    membership_id,
    role_id,
    scope_kind,
    scope_id,
    resource_type
  ),
  unique (id, organisation_id),
  check (scope_kind <> 'organisation' or scope_id = organisation_id),
  check (
    (scope_kind = 'resource' and resource_type is not null)
    or (scope_kind <> 'resource' and resource_type is null)
  )
);

create table public.organisation_settings (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9-]*$'),
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, key),
  unique (id, organisation_id)
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 80),
  starts_on date not null,
  ends_on date not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, name),
  unique (id, organisation_id),
  check (ends_on >= starts_on)
);

create table public.organisation_invites (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  email text not null check (email = lower(email)),
  role_id uuid not null,
  scope_kind public.scope_kind not null,
  scope_id uuid not null,
  resource_type text,
  token_digest text not null unique check (length(token_digest) >= 32),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (role_id, organisation_id)
    references public.roles(id, organisation_id) on delete cascade,
  unique (id, organisation_id),
  check (scope_kind <> 'organisation' or scope_id = organisation_id),
  check (
    (scope_kind = 'resource' and resource_type is not null)
    or (scope_kind <> 'resource' and resource_type is null)
  ),
  check (expires_at > created_at),
  check (accepted_at is null or accepted_at >= created_at)
);

insert into public.permissions (key, description)
values
  ('club:manage', 'Manage organisation settings'),
  ('entitlements:view', 'View organisation entitlements'),
  ('invitations:manage', 'Manage adult invitations'),
  ('memberships:manage', 'Manage organisation memberships'),
  ('memberships:view', 'View organisation memberships'),
  ('roles:manage', 'Manage scoped organisation roles'),
  ('seasons:manage', 'Manage organisation seasons'),
  ('settings:manage', 'Manage organisation settings');

create index memberships_user_organisation_idx
  on public.memberships (user_id, organisation_id, status);
create index memberships_organisation_status_idx
  on public.memberships (organisation_id, status);
create index roles_organisation_idx
  on public.roles (organisation_id, key);
create index role_permissions_organisation_role_idx
  on public.role_permissions (organisation_id, role_id);
create index scoped_assignments_membership_scope_idx
  on public.scoped_role_assignments (
    organisation_id,
    membership_id,
    scope_kind,
    scope_id
  );
create index scoped_assignments_role_idx
  on public.scoped_role_assignments (organisation_id, role_id);
create index entitlements_organisation_enabled_idx
  on public.entitlements (organisation_id, enabled);
create index seasons_organisation_dates_idx
  on public.seasons (organisation_id, starts_on, ends_on);
create index organisation_invites_organisation_email_idx
  on public.organisation_invites (organisation_id, email);
create index organisation_invites_expiry_idx
  on public.organisation_invites (expires_at)
  where accepted_at is null;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();
create trigger organisations_set_updated_at
before update on public.organisations
for each row execute function public.set_updated_at();
create trigger memberships_set_updated_at
before update on public.memberships
for each row execute function public.set_updated_at();
create trigger roles_set_updated_at
before update on public.roles
for each row execute function public.set_updated_at();
create trigger role_permissions_set_updated_at
before update on public.role_permissions
for each row execute function public.set_updated_at();
create trigger scoped_role_assignments_set_updated_at
before update on public.scoped_role_assignments
for each row execute function public.set_updated_at();
create trigger organisation_settings_set_updated_at
before update on public.organisation_settings
for each row execute function public.set_updated_at();
create trigger entitlements_set_updated_at
before update on public.entitlements
for each row execute function public.set_updated_at();
create trigger seasons_set_updated_at
before update on public.seasons
for each row execute function public.set_updated_at();
create trigger organisation_invites_set_updated_at
before update on public.organisation_invites
for each row execute function public.set_updated_at();

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create function public.has_active_membership(requested_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships membership
    join public.organisations organisation
      on organisation.id = membership.organisation_id
    where membership.organisation_id = requested_organisation_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and organisation.status = 'active'
  );
$$;

create function public.has_capability(
  requested_organisation_id uuid,
  requested_capability text,
  requested_scope_kind public.scope_kind,
  requested_scope_id uuid,
  requested_resource_type text default null
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
    join public.organisations organisation
      on organisation.id = membership.organisation_id
    join public.scoped_role_assignments assignment
      on assignment.membership_id = membership.id
      and assignment.organisation_id = membership.organisation_id
    join public.roles role
      on role.id = assignment.role_id
      and role.organisation_id = membership.organisation_id
    join public.role_permissions role_permission
      on role_permission.role_id = role.id
      and role_permission.organisation_id = role.organisation_id
    join public.permissions permission
      on permission.id = role_permission.permission_id
    where membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.organisation_id = requested_organisation_id
      and organisation.status = 'active'
      and permission.key = requested_capability
      and (
        (
          assignment.scope_kind = 'organisation'
          and assignment.scope_id = requested_organisation_id
        )
        or (
          assignment.scope_kind = requested_scope_kind
          and assignment.scope_id = requested_scope_id
          and (
            requested_scope_kind <> 'resource'
            or assignment.resource_type = requested_resource_type
          )
        )
      )
  );
$$;

create function public.create_organisation(
  organisation_name text,
  organisation_slug text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_organisation_id uuid;
  owner_membership_id uuid;
  owner_role_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.organisations (name, slug)
  values (btrim(organisation_name), lower(btrim(organisation_slug)))
  returning id into created_organisation_id;

  insert into public.memberships (
    organisation_id,
    user_id,
    status,
    joined_at
  )
  values (created_organisation_id, auth.uid(), 'active', now())
  returning id into owner_membership_id;

  insert into public.organisation_settings (organisation_id)
  values (created_organisation_id);

  insert into public.roles (organisation_id, key, name)
  values (created_organisation_id, 'owner', 'Organisation owner')
  returning id into owner_role_id;

  insert into public.role_permissions (
    organisation_id,
    role_id,
    permission_id
  )
  select created_organisation_id, owner_role_id, permission.id
  from public.permissions permission
  where permission.key in (
    'club:manage',
    'entitlements:view',
    'invitations:manage',
    'memberships:manage',
    'memberships:view',
    'roles:manage',
    'seasons:manage',
    'settings:manage'
  )
  on conflict (organisation_id, role_id, permission_id) do nothing;

  insert into public.scoped_role_assignments (
    organisation_id,
    membership_id,
    role_id,
    scope_kind,
    scope_id
  )
  values (
    created_organisation_id,
    owner_membership_id,
    owner_role_id,
    'organisation',
    created_organisation_id
  );

  return created_organisation_id;
end;
$$;

create function public.issue_organisation_invite(
  requested_organisation_id uuid,
  invite_email text,
  invite_role_id uuid,
  invite_scope_kind public.scope_kind,
  invite_scope_id uuid,
  invite_resource_type text,
  invite_token_digest text,
  invite_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_invite_id uuid;
begin
  if not public.has_capability(
    requested_organisation_id,
    'invitations:manage',
    invite_scope_kind,
    invite_scope_id,
    invite_resource_type
  ) or not public.has_capability(
    requested_organisation_id,
    'roles:manage',
    invite_scope_kind,
    invite_scope_id,
    invite_resource_type
  ) then
    raise insufficient_privilege using message = 'Invitation issuance is not authorised';
  end if;

  if invite_token_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'Invitation digest is invalid';
  end if;
  if invite_expires_at <= now() then
    raise exception 'Invitation expiry must be in the future';
  end if;

  insert into public.organisation_invites (
    organisation_id,
    email,
    role_id,
    scope_kind,
    scope_id,
    resource_type,
    token_digest,
    expires_at
  )
  values (
    requested_organisation_id,
    lower(btrim(invite_email)),
    invite_role_id,
    invite_scope_kind,
    invite_scope_id,
    invite_resource_type,
    invite_token_digest,
    invite_expires_at
  )
  returning id into created_invite_id;

  return created_invite_id;
end;
$$;

create function public.accept_organisation_invite(invite_token_digest text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.organisation_invites%rowtype;
  authenticated_email text;
  accepted_membership_id uuid;
  accepted_membership_status public.membership_status;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into invite
  from public.organisation_invites organisation_invite
  where organisation_invite.token_digest = $1
  for update;

  if not found or invite.accepted_at is not null or invite.expires_at <= now() then
    raise exception 'Invitation could not be accepted';
  end if;

  select lower(coalesce(
    auth.jwt() ->> 'email',
    current_setting('request.jwt.claim.email', true),
    ''
  )) into authenticated_email;
  if authenticated_email = '' or authenticated_email <> invite.email then
    raise exception 'Invitation could not be accepted';
  end if;

  if not exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid() and profile.account_type = 'adult'
  ) then
    raise exception 'Invitation could not be accepted';
  end if;

  if not exists (
    select 1 from public.organisations organisation
    where organisation.id = invite.organisation_id
      and organisation.status = 'active'
  ) then
    raise exception 'Invitation could not be accepted';
  end if;

  insert into public.memberships (
    organisation_id,
    user_id,
    status,
    joined_at
  )
  values (invite.organisation_id, auth.uid(), 'active', now())
  on conflict (organisation_id, user_id) do nothing
  returning id, status into accepted_membership_id, accepted_membership_status;

  if accepted_membership_id is null then
    select membership.id, membership.status
    into accepted_membership_id, accepted_membership_status
    from public.memberships membership
    where membership.organisation_id = invite.organisation_id
      and membership.user_id = auth.uid()
    for update;
  end if;

  if accepted_membership_id is null or accepted_membership_status <> 'active' then
    raise exception 'Invitation could not be accepted';
  end if;

  insert into public.scoped_role_assignments (
    organisation_id,
    membership_id,
    role_id,
    scope_kind,
    scope_id,
    resource_type
  )
  values (
    invite.organisation_id,
    accepted_membership_id,
    invite.role_id,
    invite.scope_kind,
    invite.scope_id,
    invite.resource_type
  )
  on conflict do nothing;

  update public.organisation_invites
  set accepted_at = now(), accepted_by = auth.uid()
  where id = invite.id;

  return accepted_membership_id;
end;
$$;

revoke all on function public.has_active_membership(uuid) from public;
revoke all on function public.has_capability(uuid, text, public.scope_kind, uuid, text) from public;
revoke all on function public.create_organisation(text, text) from public;
revoke all on function public.issue_organisation_invite(
  uuid, text, uuid, public.scope_kind, uuid, text, text, timestamptz
) from public;
revoke all on function public.accept_organisation_invite(text) from public;
grant execute on function public.has_active_membership(uuid) to authenticated;
grant execute on function public.has_capability(uuid, text, public.scope_kind, uuid, text) to authenticated;
grant execute on function public.create_organisation(text, text) to authenticated;
grant execute on function public.issue_organisation_invite(
  uuid, text, uuid, public.scope_kind, uuid, text, text, timestamptz
) to authenticated;
grant execute on function public.accept_organisation_invite(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.organisations enable row level security;
alter table public.memberships enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.scoped_role_assignments enable row level security;
alter table public.organisation_settings enable row level security;
alter table public.entitlements enable row level security;
alter table public.seasons enable row level security;
alter table public.organisation_invites enable row level security;

create policy profiles_select_own
on public.profiles for select to authenticated
using (id = auth.uid());
create policy profiles_update_own
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid() and account_type = 'adult');

create policy organisations_select_members
on public.organisations for select to authenticated
using (public.has_active_membership(id));
create policy organisations_update_scoped
on public.organisations for update to authenticated
using (public.has_capability(id, 'club:manage', 'organisation', id, null))
with check (public.has_capability(id, 'club:manage', 'organisation', id, null));
create policy organisations_delete_scoped
on public.organisations for delete to authenticated
using (public.has_capability(id, 'organisations:delete', 'organisation', id, null));

create policy memberships_select_scoped
on public.memberships for select to authenticated
using (
  user_id = auth.uid()
  or public.has_capability(
    organisation_id,
    'memberships:view',
    'organisation',
    organisation_id,
    null
  )
);
create policy memberships_insert_scoped
on public.memberships for insert to authenticated
with check (
  public.has_capability(
    organisation_id,
    'memberships:manage',
    'organisation',
    organisation_id,
    null
  )
);
create policy memberships_update_scoped
on public.memberships for update to authenticated
using (
  public.has_capability(
    organisation_id,
    'memberships:manage',
    'organisation',
    organisation_id,
    null
  )
)
with check (
  public.has_capability(
    organisation_id,
    'memberships:manage',
    'organisation',
    organisation_id,
    null
  )
);
create policy memberships_delete_scoped
on public.memberships for delete to authenticated
using (
  public.has_capability(
    organisation_id,
    'memberships:manage',
    'organisation',
    organisation_id,
    null
  )
);

create policy roles_select_members
on public.roles for select to authenticated
using (public.has_active_membership(organisation_id));
create policy roles_manage_scoped
on public.roles for all to authenticated
using (public.has_capability(organisation_id, 'roles:manage', 'organisation', organisation_id, null))
with check (public.has_capability(organisation_id, 'roles:manage', 'organisation', organisation_id, null));

create policy permissions_select_authenticated
on public.permissions for select to authenticated
using (true);

create policy role_permissions_select_members
on public.role_permissions for select to authenticated
using (public.has_active_membership(organisation_id));
create policy role_permissions_manage_scoped
on public.role_permissions for all to authenticated
using (public.has_capability(organisation_id, 'roles:manage', 'organisation', organisation_id, null))
with check (public.has_capability(organisation_id, 'roles:manage', 'organisation', organisation_id, null));

create policy assignments_select_scoped
on public.scoped_role_assignments for select to authenticated
using (
  exists (
    select 1
    from public.memberships membership
    where membership.id = scoped_role_assignments.membership_id
      and membership.organisation_id = scoped_role_assignments.organisation_id
      and membership.user_id = auth.uid()
  )
  or public.has_capability(organisation_id, 'roles:manage', 'organisation', organisation_id, null)
);
create policy assignments_manage_scoped
on public.scoped_role_assignments for all to authenticated
using (public.has_capability(organisation_id, 'roles:manage', 'organisation', organisation_id, null))
with check (public.has_capability(organisation_id, 'roles:manage', 'organisation', organisation_id, null));

create policy settings_select_members
on public.organisation_settings for select to authenticated
using (public.has_active_membership(organisation_id));
create policy settings_manage_scoped
on public.organisation_settings for all to authenticated
using (public.has_capability(organisation_id, 'settings:manage', 'organisation', organisation_id, null))
with check (public.has_capability(organisation_id, 'settings:manage', 'organisation', organisation_id, null));

create policy entitlements_select_scoped
on public.entitlements for select to authenticated
using (
  public.has_capability(
    organisation_id,
    'entitlements:view',
    'organisation',
    organisation_id,
    null
  )
);
create policy entitlements_manage_scoped
on public.entitlements for all to authenticated
using (
  public.has_capability(
    organisation_id,
    'entitlements:manage',
    'organisation',
    organisation_id,
    null
  )
)
with check (
  public.has_capability(
    organisation_id,
    'entitlements:manage',
    'organisation',
    organisation_id,
    null
  )
);

create policy seasons_select_members
on public.seasons for select to authenticated
using (public.has_active_membership(organisation_id));
create policy seasons_manage_scoped
on public.seasons for all to authenticated
using (public.has_capability(organisation_id, 'seasons:manage', 'organisation', organisation_id, null))
with check (public.has_capability(organisation_id, 'seasons:manage', 'organisation', organisation_id, null));

create policy invites_select_scoped
on public.organisation_invites for select to authenticated
using (
  public.has_capability(
    organisation_id,
    'invitations:manage',
    'organisation',
    organisation_id,
    null
  )
);
revoke insert, update, delete on public.organisation_invites from authenticated;
grant select, update on public.profiles to authenticated;
grant select, update, delete on public.organisations to authenticated;
grant select, insert, update, delete on public.memberships to authenticated;
grant select, insert, update, delete on public.roles to authenticated;
grant select on public.permissions to authenticated;
grant select, insert, update, delete on public.role_permissions to authenticated;
grant select, insert, update, delete on public.scoped_role_assignments to authenticated;
grant select, insert, update, delete on public.organisation_settings to authenticated;
grant select, insert, update, delete on public.entitlements to authenticated;
grant select, insert, update, delete on public.seasons to authenticated;
grant select on public.organisation_invites to authenticated;
