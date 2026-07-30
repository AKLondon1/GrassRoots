-- Let team staff publish an announcement to their own team.
--
-- Migration 0020 granted `announcements:manage` to manager and coach and described
-- it as "Send announcements and change notices to a team". Nothing consumed it.
-- `publish_announcement` (0006_comms_finance.sql:178) gated publishing on
-- organisation-scoped `messages:manage`, a permission whose own description is
-- "Moderate adult group conversations" (0006_comms_finance.sql:4) and which only
-- owner and club-admin hold (0006_comms_finance.sql:31, :47). A coach therefore
-- held a publishing permission that no code path honoured, and every attempt
-- raised 42501.
--
-- This is the fifth instance of the family behind 0023 to 0026: a capability
-- granted without checking it against the code that consumes it. The failure mode
-- is not carelessness. `messages:manage` was the nearest communications-shaped
-- capability to hand when the RPC was written, it was reused for a job it was not
-- named for, and nobody re-read what it actually guarded.
--
-- The model had already drifted around the gap. The seed's demo announcement
-- (supabase/seed.sql:555) is team-scoped and authored by the coach's membership,
-- depicting a publish the RPC refused. Migration 0028 gave a team-scoped author
-- sight of the delivery rows for announcements they had no way to create. The read
-- side had moved on; only the write side was still locked.
--
-- THE RULE THIS SETTLES. Addressing every adult in the club is a club-wide act and
-- stays with the organisation-scoped roles. Addressing one team is a team act and
-- belongs to whoever staffs that team. The scope of the announcement decides which
-- check applies, so the two cannot be confused.

-- `can_access_team` rather than `has_capability` for the team branch, because a
-- coach's grant is team-scoped and has_capability at organisation scope cannot see
-- it. can_access_team (0003_events_polls_squads.sql:430) already accepts either a
-- team-scoped assignment against this team OR an organisation-scoped one, so a club
-- administrator satisfies the team branch too and needs no separate arm.
--
-- The org branch now accepts `announcements:manage` as well as `messages:manage`.
-- That is behaviour-neutral today — 0020 gives club-admin and owner both — but it
-- names the intent, so the next reader is not sent back to a moderation permission
-- to understand who may publish.
create or replace function public.publish_announcement(
  requested_organisation_id uuid,
  requested_title text,
  requested_body text,
  requested_team_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  announcement_id uuid;
  permitted boolean;
begin
  if requested_team_id is null then
    permitted :=
      public.has_capability(
        requested_organisation_id, 'announcements:manage',
        'organisation', requested_organisation_id, null
      )
      or public.has_capability(
        requested_organisation_id, 'messages:manage',
        'organisation', requested_organisation_id, null
      );
  else
    permitted :=
      public.can_access_team(
        requested_organisation_id, requested_team_id, 'announcements:manage'
      )
      or public.has_capability(
        requested_organisation_id, 'messages:manage',
        'organisation', requested_organisation_id, null
      );
  end if;

  if not permitted then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  select id into actor_id
  from public.memberships
  where organisation_id = requested_organisation_id
    and user_id = auth.uid()
    and status = 'active';

  if actor_id is null then
    raise exception 'active membership required' using errcode = '42501';
  end if;

  insert into public.announcements (
    organisation_id, team_id, authored_by_membership_id, title, body, status, published_at
  )
  values (
    requested_organisation_id, requested_team_id, actor_id,
    requested_title, requested_body, 'published', now()
  )
  returning id into announcement_id;

  return announcement_id;
end;
$$;

comment on function public.publish_announcement(uuid, text, text, uuid) is
  'Publishes an announcement. Club-wide (team_id null) requires organisation-scoped announcements:manage or messages:manage. Team-scoped requires announcements:manage over that team, which a coach or manager holds through their team assignment.';

-- The same rule on the table policy, so the two do not drift apart again.
--
-- READ THIS BEFORE ASSUMING THIS AUTHORISES A WRITE. It does not, and cannot.
-- `announcements` carries `revoke all` followed by `grant select` and nothing else
-- (0006_comms_finance.sql:587, :595), so no authenticated user can INSERT, UPDATE
-- or DELETE the table by any route — the missing table grant refuses before RLS is
-- consulted. Every write goes through publish_announcement above, which is
-- SECURITY DEFINER and bypasses both.
--
-- What this policy does do is contribute its USING clause to SELECT, as any FOR ALL
-- policy does. That makes it a second read arm beside `announcements_read`
-- (0006_comms_finance.sql:536), and the only arm that can reach an announcement
-- which is not yet published, since announcements_read's audience arm requires
-- status='published'. Before this change a coach could not see a draft addressed to
-- their own team. Nothing writes a draft today, but that is the same asymmetry this
-- migration exists to remove, and leaving it would make any future draft or
-- scheduled composer invisible to its own author.
--
-- No write grant is added here on purpose. The RPC sets authored_by_membership_id
-- from auth.uid(); a direct insert would have to duplicate that, and an author who
-- could set it by hand could attribute an announcement to somebody else.
--
-- The team arm is written against `announcements:manage`, not `is_team_audience`.
-- Copying the audience test from announcements_read would be the obvious move and
-- would show every parent on the team the coach's unfinished drafts.
alter policy announcements_manage on public.announcements
using (
  public.has_capability(
    organisation_id, 'announcements:manage', 'organisation', organisation_id, null
  )
  or public.has_capability(
    organisation_id, 'messages:manage', 'organisation', organisation_id, null
  )
  or (
    team_id is not null
    and public.can_access_team(organisation_id, team_id, 'announcements:manage')
  )
)
with check (
  public.has_capability(
    organisation_id, 'announcements:manage', 'organisation', organisation_id, null
  )
  or public.has_capability(
    organisation_id, 'messages:manage', 'organisation', organisation_id, null
  )
  or (
    team_id is not null
    and public.can_access_team(organisation_id, team_id, 'announcements:manage')
  )
);

comment on policy announcements_manage on public.announcements is
  'Whoever may publish an announcement may manage it. Team staff are limited to announcements addressed to a team they staff. Reachable only as a SELECT arm today: the table carries no write grant, so every write goes through publish_announcement.';
