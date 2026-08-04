-- Club location: a club is a place as well as a name.
--
-- "Barrow Town FC based in Barrow upon Soar" could not be recorded, because
-- `organisations` held only id, name, slug, status and timestamps. Grassroots
-- clubs are identified by their village as much as their name, and fixture lists,
-- travel directions and opposition contact all assume it exists.
--
-- NO NEW AUTHORISATION. Both columns land on `organisations`, whose existing RLS
-- policies already scope reads and writes by active membership. Adding a nullable
-- column widens no policy and grants no capability.

alter table public.organisations
  add column if not exists locality text,
  add column if not exists postcode text;

-- Length bounds mirror the existing `name` constraint rather than inventing new
-- ones. Both columns stay nullable: a club that has not told us where it plays is
-- a valid club, and a NOT NULL here would break every existing row.
alter table public.organisations
  drop constraint if exists organisations_locality_length;
alter table public.organisations
  add constraint organisations_locality_length
    check (locality is null or length(btrim(locality)) between 2 and 120);

-- UK postcode shape, deliberately permissive: it accepts the formats Royal Mail
-- defines and rejects free text, but does not verify the postcode exists.
alter table public.organisations
  drop constraint if exists organisations_postcode_format;
alter table public.organisations
  add constraint organisations_postcode_format
    check (
      postcode is null
      or btrim(upper(postcode)) ~ '^[A-Z]{1,2}[0-9][A-Z0-9]?[ ]?[0-9][A-Z]{2}$'
    );

comment on column public.organisations.locality is
  'Town or village the club is based in, e.g. Barrow upon Soar.';
comment on column public.organisations.postcode is
  'UK postcode of the club''s home ground or registered address. Shape-checked only.';
