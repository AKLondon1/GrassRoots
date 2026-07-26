-- Check approval without exposing private development review rows to guardians.

create or replace function public.is_approved_development_review(
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

drop policy parent_development_linked on public.parent_development_summaries;
create policy parent_development_linked
on public.parent_development_summaries
for select
to authenticated
using (
  public.guardian_can_respond_for_player(
    organisation_id,
    team_id,
    player_id,
    'development:view-approved'
  )
  and public.is_approved_development_review(organisation_id, review_id)
);
