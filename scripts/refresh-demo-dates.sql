-- Slide the demo club's calendar forward so staging looks alive.
--
-- WHY THIS IS NOT A CHANGE TO seed.sql. The obvious fix is to anchor the seed
-- to now(). It was tried, and it broke 21 pgTAP assertions across four files:
-- poll 1301 being CLOSED is load-bearing (role_read_access.sql:113 designates
-- it the closed case, with 3006 as the open one), the recurrence-edit tests
-- pass literal occurrence times that must land on the series, the facilities
-- closure has to overlap instance 1202 to cancel it, and the booking-conflict
-- tests expect 23P01 against the seeded bookings' absolute times. The suite is
-- insulated from those dates ROTTING; it is not independent of their VALUES.
--
-- So the seed keeps its literals and the whole demo world is translated instead.
-- ONE delta is applied to every timestamp, which is the entire point: relative
-- alignment is preserved exactly, so nothing that depends on two rows lining up
-- can come apart. The seed stays the fixed reference the tests are written
-- against, and this script is a staging concern only.
--
-- Idempotent: the delta is recomputed from current state each run, so running
-- it twice lands the match in the same place, not six days out.
--
--   psql "$DATABASE_URL" -f scripts/refresh-demo-dates.sql

do $$
declare
  demo_org constant uuid := '00000000-0000-4000-8000-000000000101';
  -- The match. Everything else is positioned relative to it by the seed, so
  -- moving it moves the story without rewriting the story.
  --
  -- Anchored on its RESPONSE DEADLINE, not its start. The seed puts the deadline
  -- four days ahead of kickoff, so targeting the start leaves the deadline in the
  -- past and the availability screen shut, which is the exact thing this script
  -- exists to prevent. An open deadline is the point; kickoff follows from it.
  anchor_instance constant uuid := '00000000-0000-4000-8000-000000001202';
  shift interval;
  moved integer := 0;
  affected integer;
begin
  select (date_trunc('day', now()) + interval '2 days' + interval '18 hours') - instance.response_deadline
    into shift
  from public.event_instances instance
  where instance.id = anchor_instance and instance.organisation_id = demo_org;

  if shift is null then
    raise exception 'demo anchor instance % not found in organisation %; is this database seeded?',
      anchor_instance, demo_org;
  end if;

  raise notice 'shifting the demo calendar by %', shift;

  update public.event_series set
    starts_at = starts_at + shift,
    ends_at = ends_at + shift,
    until_at = until_at + shift
  where organisation_id = demo_org;
  get diagnostics affected = row_count; moved := moved + affected;

  update public.event_instances set
    starts_at = starts_at + shift,
    ends_at = ends_at + shift,
    response_deadline = response_deadline + shift
  where organisation_id = demo_org;
  get diagnostics affected = row_count; moved := moved + affected;

  -- The patch restates the moved start time as text, so it has to travel too or
  -- the exception starts disagreeing with the instance it points at.
  update public.event_exceptions set
    original_starts_at = original_starts_at + shift,
    patch = case
      when patch ? 'startsAt' then jsonb_set(
        patch, '{startsAt}',
        to_jsonb(to_char(
          ((patch->>'startsAt')::timestamptz + shift) at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS"Z"'
        ))
      )
      else patch
    end
  where organisation_id = demo_org;
  get diagnostics affected = row_count; moved := moved + affected;

  update public.availability_responses set responded_at = responded_at + shift
  where organisation_id = demo_org;
  get diagnostics affected = row_count; moved := moved + affected;

  update public.polls set closes_at = closes_at + shift where organisation_id = demo_org;
  get diagnostics affected = row_count; moved := moved + affected;

  update public.poll_options set starts_at = starts_at + shift, ends_at = ends_at + shift
  where organisation_id = demo_org;
  get diagnostics affected = row_count; moved := moved + affected;

  -- Bookings carry an exclusion constraint. Shifting every one of them by the
  -- same delta cannot introduce an overlap that was not already there.
  update public.facility_bookings set starts_at = starts_at + shift, ends_at = ends_at + shift
  where organisation_id = demo_org;
  get diagnostics affected = row_count; moved := moved + affected;

  raise notice 'moved % rows', moved;
end $$;
