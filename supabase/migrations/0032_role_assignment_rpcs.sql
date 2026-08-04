-- Assigning and revoking roles: the write paths that were never built.
--
-- The permission model was already complete. `scoped_role_assignments` carries
-- `assignments_manage_scoped`, which admits anyone holding `roles:manage` at
-- organisation scope, and 0022's `enforce_team_scoped_staff_roles` trigger already
-- refuses a manager or coach assigned at organisation scope. What was missing was
-- a callable surface: `issue_organisation_invite` could set a role at invite time
-- and nothing could change it afterwards.
--
-- NO NEW AUTHORISATION. Both functions are SECURITY INVOKER, so the existing RLS
-- policy is the enforcement, not a check inside the function body that a future
-- edit could quietly drop. The explicit has_capability guard below is defence in
-- depth and a better error message - never the sole gate.

create or replace function public.assign_role(
  p_membership_id uuid,
  p_role_key text,
  p_scope_kind public.scope_kind default 'organisation',
  p_scope_id uuid default null
)
returns public.scoped_role_assignments
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_organisation_id uuid;
  v_role_id uuid;
  v_scope_id uuid;
  v_assignment public.scoped_role_assignments;
begin
  -- Resolve the organisation from the membership rather than trusting a caller
  -- supplied one. A caller who could name the organisation could name someone
  -- else's.
  select organisation_id into v_organisation_id
  from public.memberships where id = p_membership_id;

  if v_organisation_id is null then
    raise exception 'Membership % does not exist', p_membership_id
      using errcode = 'no_data_found';
  end if;

  if not public.has_capability(
       v_organisation_id, 'roles:manage', 'organisation', v_organisation_id, null
     ) then
    raise exception 'You do not have permission to manage roles in this club'
      using errcode = 'insufficient_privilege';
  end if;

  select id into v_role_id
  from public.roles
  where organisation_id = v_organisation_id and key = p_role_key;

  if v_role_id is null then
    raise exception 'Role % does not exist in this club', p_role_key
      using errcode = 'no_data_found';
  end if;

  -- An organisation-scoped assignment scopes to the organisation itself. A
  -- team-scoped one must name its team, and that team must belong to the same
  -- club: a scope_id from another tenant is the whole cross-tenant hazard.
  v_scope_id := coalesce(p_scope_id, v_organisation_id);

  if p_scope_kind = 'team' then
    if p_scope_id is null then
      raise exception 'A team-scoped role must name the team'
        using errcode = 'invalid_parameter_value';
    end if;
    if not exists (
      select 1 from public.teams
      where id = p_scope_id and organisation_id = v_organisation_id
    ) then
      raise exception 'Team % does not belong to this club', p_scope_id
        using errcode = 'invalid_parameter_value';
    end if;
  end if;

  -- Idempotent: re-assigning the same role at the same scope returns the existing
  -- row rather than raising. An admin clicking twice is not an error.
  insert into public.scoped_role_assignments
    (organisation_id, membership_id, role_id, scope_kind, scope_id)
  values
    (v_organisation_id, p_membership_id, v_role_id, p_scope_kind, v_scope_id)
  on conflict do nothing
  returning * into v_assignment;

  if v_assignment.id is null then
    select * into v_assignment
    from public.scoped_role_assignments
    where organisation_id = v_organisation_id
      and membership_id = p_membership_id
      and role_id = v_role_id
      and scope_kind = p_scope_kind
      and scope_id = v_scope_id;
  end if;

  return v_assignment;
end;
$$;

create or replace function public.revoke_role(p_assignment_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_organisation_id uuid;
begin
  select organisation_id into v_organisation_id
  from public.scoped_role_assignments where id = p_assignment_id;

  -- Silently true for an already-absent assignment would hide a bug. Silently
  -- false would hide a permission failure. Distinguish them.
  if v_organisation_id is null then
    return false;
  end if;

  if not public.has_capability(
       v_organisation_id, 'roles:manage', 'organisation', v_organisation_id, null
     ) then
    raise exception 'You do not have permission to manage roles in this club'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.scoped_role_assignments where id = p_assignment_id;
  return found;
end;
$$;

comment on function public.assign_role(uuid, text, public.scope_kind, uuid) is
  'Assign a role to a membership, at organisation or team scope. Idempotent. RLS enforced.';
comment on function public.revoke_role(uuid) is
  'Remove a scoped role assignment. Returns false if it was already absent. RLS enforced.';

revoke all on function public.assign_role(uuid, text, public.scope_kind, uuid) from public;
revoke all on function public.revoke_role(uuid) from public;
grant execute on function public.assign_role(uuid, text, public.scope_kind, uuid) to authenticated;
grant execute on function public.revoke_role(uuid) to authenticated;
