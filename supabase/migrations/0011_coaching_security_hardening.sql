-- Harden shared summary triggers and service-only AI audit writes.

create or replace function public.enforce_parent_summary_approval()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor_membership_id uuid;
begin
  select membership.id
  into actor_membership_id
  from public.memberships membership
  where membership.organisation_id = new.organisation_id
    and membership.user_id = auth.uid()
    and membership.status = 'active';

  if current_user not in ('postgres', 'supabase_admin') then
    if actor_membership_id is null then
      raise insufficient_privilege using message = 'Active membership required for approval';
    end if;
    new.approved_by_membership_id := actor_membership_id;
    new.approved_at := now();
  end if;

  if tg_table_name = 'parent_development_summaries' then
    if not exists (
      select 1
      from public.development_reviews review
      where review.id = new.review_id
        and review.organisation_id = new.organisation_id
        and review.team_id = new.team_id
        and review.player_id = new.player_id
        and review.status = 'approved'
    ) then
      raise exception 'Only an approved development review can be shared';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.record_coaching_ai_run(
  requested_actor_user_id uuid,
  requested_organisation_id uuid,
  requested_team_id uuid,
  requested_purpose text,
  requested_model text,
  requested_prompt_version text,
  requested_schema_version text,
  requested_request_hash text,
  requested_provider_status text,
  requested_input_tokens integer default null,
  requested_output_tokens integer default null,
  requested_estimated_cost_gbp numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_membership_id uuid;
  created_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;

  select id
  into actor_membership_id
  from public.memberships
  where organisation_id = requested_organisation_id
    and user_id = requested_actor_user_id
    and status = 'active';

  if actor_membership_id is null then
    raise exception 'Active membership required';
  end if;

  insert into public.coaching_ai_runs (
    organisation_id,
    team_id,
    requested_by_membership_id,
    purpose,
    model,
    prompt_version,
    schema_version,
    request_hash,
    provider_status,
    input_tokens,
    output_tokens,
    estimated_cost_gbp
  )
  values (
    requested_organisation_id,
    requested_team_id,
    actor_membership_id,
    requested_purpose,
    requested_model,
    requested_prompt_version,
    requested_schema_version,
    requested_request_hash,
    requested_provider_status,
    requested_input_tokens,
    requested_output_tokens,
    requested_estimated_cost_gbp
  )
  returning id into created_id;

  return created_id;
end;
$$;
