-- Let the people who publish an announcement see whether it landed.
--
-- announcement_recipients has carried exactly one SELECT policy since 0006,
-- announcement_recipients_own, matching the reader's own membership. That is right
-- for a parent and useless for an author: the coach who published "meet at 09:40"
-- could see their own copy and nothing else, so "did the team get this?" had no
-- answer in the product at all. role_read_access.sql recorded that as the deliberate
-- state pending a decision. This migration is that decision.
--
-- SCOPE FOLLOWS THE AUTHORITY TO PUBLISH. Three routes, matching the three ways a
-- member can legitimately hold announcements over these rows:
--
--   organisation-scoped announcements:manage  club administrators and owners
--   organisation-scoped messages:manage       the communications role
--   team-scoped announcements:manage          a coach or manager, on their own team
--
-- The third is the one that matters day to day and the one has_capability cannot
-- express on its own, because a coach's grant is team-scoped and the recipient row
-- carries no team_id. The team is a property of the announcement, so the check joins
-- through it and asks can_access_team against that team.
--
-- WHAT THIS DOES AND DOES NOT EXPOSE. A delivery row is a membership id and a
-- read_at timestamp. It reveals that an adult has opened a club announcement, which
-- is ordinary for any messaging product and is the point of asking. It reaches no
-- child record, no guardian link and no other family: announcement_recipients has no
-- player_id, and the join is confined to announcements the reader may already manage.
-- A club-wide announcement (team_id is null) is readable only by the two
-- organisation-scoped roles, so a coach cannot use it to enumerate the whole club.
--
-- Deliberately SELECT only. The trigger enqueue_published_announcement_deliveries
-- (0008_release_hardening.sql:516) owns the write side, and an author editing
-- delivery rows by hand has no legitimate use.

create policy announcement_recipients_publisher
on public.announcement_recipients for select to authenticated
using (
  exists (
    select 1
    from public.announcements announcement
    where announcement.id = announcement_recipients.announcement_id
      and announcement.organisation_id = announcement_recipients.organisation_id
      and (
        public.has_capability(
          announcement.organisation_id, 'announcements:manage',
          'organisation', announcement.organisation_id, null
        )
        or public.has_capability(
          announcement.organisation_id, 'messages:manage',
          'organisation', announcement.organisation_id, null
        )
        or (
          announcement.team_id is not null
          and public.can_access_team(
            announcement.organisation_id, announcement.team_id, 'announcements:manage'
          )
        )
      )
  )
);

comment on policy announcement_recipients_publisher on public.announcement_recipients is
  'Whoever may publish an announcement may see who it was delivered to. Team staff are limited to announcements addressed to a team they staff.';
