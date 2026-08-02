-- Let a fixture record who it is against.
--
-- public.opposition_contacts has existed since 0002 as a per-organisation address
-- book, but nothing references it. A match's opponent therefore survives only
-- inside the free-text events.title ("Under 11s v Meadow Park"), which cannot be
-- queried, cannot be corrected when a club renames, and gives the address book no
-- purpose. Task 6b creates friendlies, and a friendly without a named opponent is
-- not a fixture.
--
-- Nullable on purpose: training, meetings and socials have no opponent, and the
-- existing match rows have none recorded. The composite foreign key mirrors the
-- convention used throughout the schema, so a contact from another organisation
-- is refused by the database rather than by a policy.
--
-- Phase 1b note: when clubs become able to arrange fixtures with each other, the
-- link between an opposition_contacts row and a real organisation belongs on
-- opposition_contacts, not here. This column stays correct either way.

alter table public.events
  add column opposition_contact_id uuid,
  add constraint events_opposition_contact_fkey
    foreign key (opposition_contact_id, organisation_id)
    references public.opposition_contacts (id, organisation_id)
    on delete set null;

comment on column public.events.opposition_contact_id is
  'The opposing club for a match, drawn from this organisation''s opposition_contacts. Null for training, meetings and socials.';

create index events_opposition_contact_idx
  on public.events (organisation_id, opposition_contact_id)
  where opposition_contact_id is not null;
