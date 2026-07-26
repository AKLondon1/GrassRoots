-- Avoid resolving table-specific transition fields on shared triggers.

create or replace function public.validate_formation_editable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  requested_match_id uuid;
  match_status public.match_state;
begin
  if tg_table_name = 'formations' then
    requested_match_id := coalesce(new.match_id, old.match_id);
  else
    select formation.match_id
    into requested_match_id
    from public.formations formation
    where formation.id = coalesce(new.formation_id, old.formation_id)
      and formation.organisation_id = coalesce(new.organisation_id, old.organisation_id);
  end if;

  select state into match_status
  from public.matches
  where id = requested_match_id;

  if match_status is distinct from 'ready'::public.match_state then
    raise exception 'Formation is locked after match start';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
