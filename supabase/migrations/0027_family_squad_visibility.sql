-- Keep an unpublished squad away from families.
--
-- role_read_access.sql recorded the gap: squad_members_view_linked_or_manage
-- (0003_events_polls_squads.sql:1201) tests squads:view and the guardian link, but
-- never the parent squad's status. A guardian could therefore read a DRAFT squad's
-- members, and the only thing standing between a family and a half-built team sheet
-- was the application remembering to filter. A parent seeing their child dropped
-- from a squad the coach has not finished picking is exactly the kind of harm the
-- publication step exists to prevent, and it should not depend on a `.eq()` call
-- surviving every future refactor of the parent screen.
--
-- WHY THE CONDITION IS NOT BLANKET. Both policies have two arms, and team staff
-- reach the first one through squads:manage. They are the people building the draft,
-- so a blanket published check would break squad selection for the coach it is meant
-- to serve. The status test belongs only in the arm a guardian can satisfy.
--
-- Team staff hold both squads:manage and squads:view (0020_role_model.sql:51), so
-- they keep draft access through the manage arm. Guardians hold squads:view and
-- squads:respond but never squads:manage (0020_role_model.sql:57), so for them the
-- narrowed arm is the only route and the draft disappears.
--
-- The application filter stays. It is now defence in depth rather than the only
-- guard, which is the right order for something with a safeguarding dimension.

drop policy squads_view_team on public.squads;

create policy squads_view_team on public.squads for select to authenticated using (
  public.can_access_team(organisation_id, team_id, 'squads:manage')
  or (
    public.can_access_team(organisation_id, team_id, 'squads:view')
    and status = 'published'
  )
);

comment on policy squads_view_team on public.squads is
  'Team staff see every squad including drafts. Everyone else sees published squads only.';

drop policy squad_members_view_linked_or_manage on public.squad_members;

create policy squad_members_view_linked_or_manage on public.squad_members for select to authenticated using (
  public.can_access_team(organisation_id, team_id, 'squads:manage')
  or (
    public.can_access_team(organisation_id, team_id, 'squads:view')
    and public.guardian_can_access_player(organisation_id, player_id)
    and exists (
      select 1
      from public.squads parent_squad
      where parent_squad.id = squad_members.squad_id
        and parent_squad.organisation_id = squad_members.organisation_id
        and parent_squad.status = 'published'
    )
  )
);

comment on policy squad_members_view_linked_or_manage on public.squad_members is
  'Team staff see every squad member. A guardian sees their own child, and only once the squad is published.';
