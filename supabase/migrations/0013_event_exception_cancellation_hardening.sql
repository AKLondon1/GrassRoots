-- Treat an omitted recurrence cancellation flag as false before constraints run.

create function public.set_event_exception_cancellation_default()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.is_cancelled := coalesce(new.is_cancelled, false);
  return new;
end;
$$;

create trigger event_exceptions_default_cancellation
before insert or update of is_cancelled
on public.event_exceptions
for each row execute function public.set_event_exception_cancellation_default();
