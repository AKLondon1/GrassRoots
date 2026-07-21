begin;

select plan(25);

select has_table('public', 'age_groups', 'age groups table exists');
select has_table('public', 'teams', 'teams table exists');
select has_table('public', 'team_memberships', 'team memberships table exists');
select has_table('public', 'players', 'players table exists');
select has_table('public', 'guardians', 'guardians table exists');
select has_table('public', 'households', 'households table exists');
select has_table('public', 'player_guardians', 'player guardians table exists');
select has_table('public', 'guardian_permissions', 'guardian permissions table exists');
select has_table('public', 'coaches', 'coaches table exists');
select has_table('public', 'volunteers', 'volunteers table exists');
select has_table('public', 'opposition_contacts', 'opposition contacts table exists');
select has_column('public', 'players', 'organisation_id', 'players are tenant scoped');
select hasnt_column('public', 'players', 'user_id', 'a player cannot map to an auth user');
select has_function(
  'public',
  'guardian_can_access_player',
  array['uuid', 'uuid'],
  'guardian player access helper exists'
);

select is(
  (
    select count(*)
    from public.players player
    join auth.users account on account.id = player.id
  ),
  0::bigint,
  'fictional children have no auth accounts'
);

insert into public.organisations (id, name, slug)
values (
  '00000000-0000-4000-8000-000000009101',
  'Northfield Juniors',
  'northfield-people-tests'
);
insert into public.roles (id, organisation_id, key, name)
values (
  '00000000-0000-4000-8000-000000009102',
  '00000000-0000-4000-8000-000000009101',
  'northfield-admin',
  'Northfield administrator'
);
insert into public.seasons (id, organisation_id, name, starts_on, ends_on)
values (
  '00000000-0000-4000-8000-000000009103',
  '00000000-0000-4000-8000-000000009101',
  'Northfield test season',
  '2026-08-01',
  '2027-05-31'
);
insert into public.age_groups (id, organisation_id, name, minimum_age, maximum_age)
values (
  '00000000-0000-4000-8000-000000009104',
  '00000000-0000-4000-8000-000000009101',
  'Northfield Under 11',
  9,
  11
);
insert into public.teams (id, organisation_id, season_id, age_group_id, name)
values (
  '00000000-0000-4000-8000-000000009105',
  '00000000-0000-4000-8000-000000009101',
  '00000000-0000-4000-8000-000000009103',
  '00000000-0000-4000-8000-000000009104',
  'Northfield Under 11s'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000201',
  true
);

select is(
  (select count(*) from public.players),
  2::bigint,
  'a guardian sees only their two linked children'
);
select is(
  (
    select count(*) from public.players
    where id = '00000000-0000-4000-8000-000000000603'
  ),
  0::bigint,
  'a guardian cannot see an unlinked child'
);
select is(
  (
    select count(*) from public.households
    where id = '00000000-0000-4000-8000-000000000502'
  ),
  0::bigint,
  'a guardian cannot enumerate another household'
);
select is(
  (
    select count(*) from public.guardians
    where id = '00000000-0000-4000-8000-000000000402'
  ),
  0::bigint,
  'restricted contact identity is not visible to another guardian'
);
select is(
  (select count(*) from public.guardian_permissions),
  2::bigint,
  'a guardian sees flags only for their own player links'
);
select throws_ok(
  $$
    insert into public.player_guardians (
      organisation_id,
      household_id,
      player_id,
      guardian_id,
      relationship
    )
    values (
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000502',
      '00000000-0000-4000-8000-000000000603',
      '00000000-0000-4000-8000-000000000401',
      'Parent'
    )
  $$,
  '42501',
  null,
  'RLS denies a guardian creating a cross-household link'
);

reset role;
select throws_ok(
  $$
    insert into public.scoped_role_assignments (
      organisation_id,
      membership_id,
      role_id,
      scope_kind,
      scope_id
    )
    values (
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-000000000f02',
      'team',
      '00000000-0000-4000-8000-000000009105'
    )
  $$,
  '23503',
  null,
  'a cross-organisation team assignment is denied'
);

select throws_ok(
  $$
    insert into public.organisation_invites (
      organisation_id,
      email,
      role_id,
      scope_kind,
      scope_id,
      token_digest,
      expires_at
    )
    values (
      '00000000-0000-4000-8000-000000000101',
      'unknown-team-manager@example.test',
      '00000000-0000-4000-8000-000000000f05',
      'team',
      '00000000-0000-4000-8000-000000009999',
      repeat('a', 64),
      '2099-12-31T23:59:59Z'
    )
  $$,
  '23503',
  null,
  'an unknown team invitation is denied'
);

select lives_ok(
  $$
    delete from public.memberships
    where id = '00000000-0000-4000-8000-000000000305'
  $$,
  'deleting an accepted guardian membership preserves the tenant row'
);
select is(
  (
    select status || ':' || coalesce(membership_id::text, 'none')
    from public.guardians
    where id = '00000000-0000-4000-8000-000000000402'
  ),
  'pending:none',
  'guardian becomes pending without clearing organisation ownership'
);

select * from finish();
rollback;
