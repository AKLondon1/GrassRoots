-- Role-provisioning triggers may grant owner permissions before bootstrap completes.

create or replace function public.create_organisation(
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
