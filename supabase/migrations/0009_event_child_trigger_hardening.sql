-- Keep table-specific trigger fields behind explicit runtime branches.

create or replace function public.validate_event_child_team_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name in (
    'availability_responses', 'event_attendance', 'poll_respondents',
    'squad_members', 'squad_history', 'transport_requests'
  ) then
    if not exists (
      select 1 from public.team_memberships team_member
      where team_member.organisation_id = new.organisation_id
        and team_member.team_id = new.team_id
        and team_member.player_id = new.player_id
        and team_member.status = 'active'
    ) then
      raise foreign_key_violation using message = 'Availability player must belong to the event team.';
    end if;
  end if;

  if tg_table_name in ('availability_responses', 'transport_requests') then
    if not exists (
      select 1 from public.player_guardians link
      where link.organisation_id = new.organisation_id
        and link.player_id = new.player_id
        and link.guardian_id = new.guardian_id
    ) then
      raise foreign_key_violation using message = 'Guardian must be linked to the player.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger transport_requests_validate_player_team on public.transport_requests;
create trigger transport_requests_validate_player_team
before insert or update of organisation_id, team_id, player_id, guardian_id
on public.transport_requests
for each row execute function public.validate_event_child_team_scope();
