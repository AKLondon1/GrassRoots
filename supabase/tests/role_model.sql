-- Asserts the canonical role model from 0020, the pitch-booking scope from 0021
-- and the team-scoped people RPCs from 0022.
--
-- No savepoints: pgTAP keeps its test log in temporary tables inside this same
-- transaction, so `rollback to savepoint` discards the bookkeeping along with the
-- data and finish() then reports "No tests run!". Mutating assertions run through
-- probe_sqlstate(), whose plpgsql BEGIN/EXCEPTION block is a subtransaction that
-- always rolls back.
--
-- Seeded identities: user ...0201 is a guardian, ...0202 is the coach of team
-- ...0802, ...0203 is the club administrator.

begin;

select plan(13);

create or replace function public.probe_sqlstate(statements text[])
returns text
language plpgsql
as $fn$
declare
  statement text;
begin
  begin
    foreach statement in array statements loop
      execute statement;
    end loop;
    raise exception using errcode = 'ZZ001', message = 'probe rollback sentinel';
  exception
    when sqlstate 'ZZ001' then return '00000';
    when others then return sqlstate;
  end;
end;
$fn$;

grant execute on function public.probe_sqlstate(text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- The permission model itself
-- ---------------------------------------------------------------------------

select is(
  (select array_agg(p.key order by p.key) from public.roles r
   join public.role_permissions rp on rp.role_id = r.id and rp.organisation_id = r.organisation_id
   join public.permissions p on p.id = rp.permission_id
   where r.key = 'manager' and r.organisation_id = '00000000-0000-4000-8000-000000000101'),
  (select array_agg(p.key order by p.key) from public.roles r
   join public.role_permissions rp on rp.role_id = r.id and rp.organisation_id = r.organisation_id
   join public.permissions p on p.id = rp.permission_id
   where r.key = 'coach' and r.organisation_id = '00000000-0000-4000-8000-000000000101'),
  'manager and coach hold an identical permission set'
);

select is(
  (select count(*) from public.roles r
   join public.role_permissions rp on rp.role_id = r.id and rp.organisation_id = r.organisation_id
   join public.permissions p on p.id = rp.permission_id
   where r.key in ('manager', 'coach') and p.key = 'teams:manage'),
  0::bigint,
  'team staff cannot create teams: only club administrators hold teams:manage'
);

select is(
  (select count(*) from public.roles r
   join public.role_permissions rp on rp.role_id = r.id and rp.organisation_id = r.organisation_id
   join public.permissions p on p.id = rp.permission_id
   where r.key = 'guardian'
     and p.key in ('family:view', 'family:respond', 'messages:view', 'help:view')),
  4::bigint,
  'guardians can reach the parent journey screens'
);

select is(
  (select count(*) from public.roles r
   join public.role_permissions rp on rp.role_id = r.id and rp.organisation_id = r.organisation_id
   join public.permissions p on p.id = rp.permission_id
   where r.key in ('club-admin', 'owner')
     and p.key in ('access:manage', 'analytics:view', 'features:manage', 'health:view',
                   'plans:manage', 'platform:view', 'providers:view', 'support:manage')),
  0::bigint,
  'club roles hold no platform operations permissions'
);

select is(
  (select count(*) from public.roles r
   join public.role_permissions rp on rp.role_id = r.id and rp.organisation_id = r.organisation_id
   where r.key = 'club-admin' and r.organisation_id = '00000000-0000-4000-8000-000000000101'),
  (select count(*) from public.roles r
   join public.role_permissions rp on rp.role_id = r.id and rp.organisation_id = r.organisation_id
   where r.key = 'owner' and r.organisation_id = '00000000-0000-4000-8000-000000000101'),
  'club owner and club administrator carry the same authority'
);

-- ---------------------------------------------------------------------------
-- Team staff must be scoped to a team, never the whole club
-- ---------------------------------------------------------------------------

select is(
  public.probe_sqlstate(array[
    $$insert into public.scoped_role_assignments (organisation_id, membership_id, role_id, scope_kind, scope_id)
      values ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000303',
              '00000000-0000-4000-8000-000000000f02', 'organisation',
              '00000000-0000-4000-8000-000000000101')$$
  ]),
  '23514',
  'a coach cannot be granted club-wide scope, which would expose every family'
);

select is(
  public.probe_sqlstate(array[
    $$insert into public.scoped_role_assignments (organisation_id, membership_id, role_id, scope_kind, scope_id)
      values ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000303',
              '00000000-0000-4000-8000-000000000f02', 'team',
              '00000000-0000-4000-8000-000000000801')$$
  ]),
  '00000',
  'a coach can be granted scope over a specific team'
);

-- ---------------------------------------------------------------------------
-- Team-scoped people management
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000202', true);

select is(
  public.probe_sqlstate(array[
    $$select public.add_player_to_team('00000000-0000-4000-8000-000000000802',
        'Probe', 'Player', '2015-04-04')$$
  ]),
  '00000',
  'team staff can add a player to their own team'
);

select is(
  public.probe_sqlstate(array[
    $$select public.add_player_to_team('00000000-0000-4000-8000-000000000801',
        'Probe', 'Player', '2015-04-04')$$
  ]),
  '42501',
  'team staff cannot add a player to a team they do not run'
);

select is(
  public.probe_sqlstate(array[
    $$select public.add_guardian_for_player('00000000-0000-4000-8000-000000000601',
        'Probe Parent', 'probe.parent@example.test', 'Parent')$$
  ]),
  '00000',
  'team staff can add a guardian for a player on their own team'
);

select is(
  public.probe_sqlstate(array[
    $$select public.move_player_to_team('00000000-0000-4000-8000-000000000601',
        '00000000-0000-4000-8000-000000000801')$$
  ]),
  '42501',
  'team staff cannot move a player between teams'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000201', true);

select is(
  public.probe_sqlstate(array[
    $$select public.add_player_to_team('00000000-0000-4000-8000-000000000802',
        'Probe', 'Player', '2015-04-04')$$
  ]),
  '42501',
  'a guardian cannot add players'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000203', true);

select is(
  public.probe_sqlstate(array[
    $$select public.move_player_to_team('00000000-0000-4000-8000-000000000601',
        '00000000-0000-4000-8000-000000000801')$$
  ]),
  '00000',
  'a club administrator can move a player between teams'
);

reset role;

select * from finish();
rollback;
