begin;

select plan(12);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000019001', 'issuer@example.test'),
  ('00000000-0000-4000-8000-000000019002', 'invitee@example.test'),
  ('00000000-0000-4000-8000-000000019003', 'outsider@example.test');

insert into public.organisations (id, name, slug, status)
values
  ('00000000-0000-4000-8000-000000011001', 'Riverside Juniors', 'invite-riverside', 'active'),
  ('00000000-0000-4000-8000-000000011002', 'Closed Juniors', 'invite-closed', 'suspended');

insert into public.memberships (id, organisation_id, user_id, status, joined_at)
values (
  '00000000-0000-4000-8000-000000012001',
  '00000000-0000-4000-8000-000000011001',
  '00000000-0000-4000-8000-000000019001',
  'active',
  now()
);

insert into public.roles (id, organisation_id, key, name)
values
  (
    '00000000-0000-4000-8000-000000013001',
    '00000000-0000-4000-8000-000000011001',
    'invitation-manager',
    'Invitation manager'
  ),
  (
    '00000000-0000-4000-8000-000000013002',
    '00000000-0000-4000-8000-000000011001',
    'coach',
    'Coach'
  ),
  (
    '00000000-0000-4000-8000-000000013003',
    '00000000-0000-4000-8000-000000011002',
    'coach',
    'Coach'
  );

insert into public.role_permissions (organisation_id, role_id, permission_id)
select
  '00000000-0000-4000-8000-000000011001',
  '00000000-0000-4000-8000-000000013001',
  permission.id
from public.permissions permission
where permission.key = 'invitations:manage';

insert into public.scoped_role_assignments (
  organisation_id,
  membership_id,
  role_id,
  scope_kind,
  scope_id
)
values (
  '00000000-0000-4000-8000-000000011001',
  '00000000-0000-4000-8000-000000012001',
  '00000000-0000-4000-8000-000000013001',
  'organisation',
  '00000000-0000-4000-8000-000000011001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000019003', true);
select set_config('request.jwt.claim.email', 'outsider@example.test', true);

select throws_ok(
  $$
    select public.issue_organisation_invite(
      '00000000-0000-4000-8000-000000011001',
      'invitee@example.test',
      '00000000-0000-4000-8000-000000013002',
      'organisation',
      '00000000-0000-4000-8000-000000011001',
      null,
      repeat('a', 64),
      now() + interval '1 day'
    )
  $$,
  '42501',
  null,
  'an unauthorised or cross-organisation adult cannot issue an invitation'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000019001', true);
select set_config('request.jwt.claim.email', 'issuer@example.test', true);
select throws_ok(
  $$
    select public.issue_organisation_invite(
      '00000000-0000-4000-8000-000000011001',
      'invitee@example.test',
      '00000000-0000-4000-8000-000000013002',
      'organisation',
      '00000000-0000-4000-8000-000000011001',
      null,
      repeat('b', 64),
      now() + interval '1 day'
    )
  $$,
  '42501',
  null,
  'invitation authority alone cannot delegate an unrestricted role'
);

reset role;
insert into public.role_permissions (organisation_id, role_id, permission_id)
select
  '00000000-0000-4000-8000-000000011001',
  '00000000-0000-4000-8000-000000013001',
  permission.id
from public.permissions permission
where permission.key = 'roles:manage';
set local role authenticated;

select lives_ok(
  $$
    select public.issue_organisation_invite(
      '00000000-0000-4000-8000-000000011001',
      'invitee@example.test',
      '00000000-0000-4000-8000-000000013002',
      'organisation',
      '00000000-0000-4000-8000-000000011001',
      null,
      repeat('b', 64),
      now() + interval '1 day'
    )
  $$,
  'an authorised adult can issue a scoped invitation'
);
select ok(
  not has_table_privilege('authenticated', 'public.organisation_invites', 'INSERT')
    and not has_table_privilege('authenticated', 'public.organisation_invites', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.organisation_invites', 'DELETE'),
  'authenticated users cannot bypass invitation RPCs with direct table mutations'
);
select ok(
  exists (
    select 1
    from public.organisation_invites
    where token_digest = repeat('b', 64)
      and token_digest <> 'raw-invitation-token'
  ),
  'only the invitation digest is persisted'
);

reset role;
insert into public.organisation_invites (
  organisation_id, email, role_id, scope_kind, scope_id, token_digest, expires_at, created_at
)
values
  (
    '00000000-0000-4000-8000-000000011001',
    'someone-else@example.test',
    '00000000-0000-4000-8000-000000013002',
    'organisation',
    '00000000-0000-4000-8000-000000011001',
    repeat('c', 64),
    now() + interval '1 day',
    now()
  ),
  (
    '00000000-0000-4000-8000-000000011001',
    'invitee@example.test',
    '00000000-0000-4000-8000-000000013002',
    'organisation',
    '00000000-0000-4000-8000-000000011001',
    repeat('d', 64),
    now() - interval '1 day',
    now() - interval '2 days'
  ),
  (
    '00000000-0000-4000-8000-000000011002',
    'invitee@example.test',
    '00000000-0000-4000-8000-000000013003',
    'organisation',
    '00000000-0000-4000-8000-000000011002',
    repeat('e', 64),
    now() + interval '1 day',
    now()
  ),
  (
    '00000000-0000-4000-8000-000000011001',
    'invitee@example.test',
    '00000000-0000-4000-8000-000000013002',
    'organisation',
    '00000000-0000-4000-8000-000000011001',
    repeat('f', 64),
    now() + interval '1 day',
    now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000019002', true);
select set_config('request.jwt.claim.email', 'Invitee@Example.Test', true);

select throws_ok(
  $$select public.accept_organisation_invite(repeat('c', 64))$$,
  'P0001',
  'Invitation could not be accepted',
  'an invitation is bound to the authenticated adult email'
);
select throws_ok(
  $$select public.accept_organisation_invite(repeat('d', 64))$$,
  'P0001',
  'Invitation could not be accepted',
  'an expired invitation cannot be accepted'
);
select throws_ok(
  $$select public.accept_organisation_invite(repeat('e', 64))$$,
  'P0001',
  'Invitation could not be accepted',
  'an inactive organisation invitation cannot be accepted'
);
select lives_ok(
  $$select public.accept_organisation_invite(repeat('b', 64))$$,
  'an authenticated matching adult can atomically accept an invitation'
);
select ok(
  exists (
    select 1
    from public.memberships membership
    join public.scoped_role_assignments assignment
      on assignment.membership_id = membership.id
    where membership.organisation_id = '00000000-0000-4000-8000-000000011001'
      and membership.user_id = '00000000-0000-4000-8000-000000019002'
      and membership.status = 'active'
      and assignment.role_id = '00000000-0000-4000-8000-000000013002'
  ),
  'acceptance creates membership and the invited scoped role assignment'
);
select throws_ok(
  $$select public.accept_organisation_invite(repeat('b', 64))$$,
  'P0001',
  'Invitation could not be accepted',
  'an accepted invitation cannot be replayed'
);

reset role;
update public.memberships
set status = 'suspended'
where organisation_id = '00000000-0000-4000-8000-000000011001'
  and user_id = '00000000-0000-4000-8000-000000019002';
set local role authenticated;
select throws_ok(
  $$select public.accept_organisation_invite(repeat('f', 64))$$,
  'P0001',
  'Invitation could not be accepted',
  'an outstanding invitation cannot reactivate a suspended membership'
);

select * from finish();
rollback;
