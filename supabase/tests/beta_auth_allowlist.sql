begin;

select plan(13);

select has_table('public', 'beta_auth_allowlist', 'beta account-creation allowlist exists');
select has_function(
  'public',
  'hook_restrict_beta_signup',
  array['jsonb'],
  'Before User Created hook exists'
);

insert into public.organisations (id, name, slug, status)
values (
  '00000000-0000-4000-8000-000000019101',
  'Beta Hook Test Club',
  'beta-hook-test-club',
  'active'
);

insert into public.roles (id, organisation_id, key, name)
values (
  '00000000-0000-4000-8000-000000019102',
  '00000000-0000-4000-8000-000000019101',
  'beta-hook-role',
  'Beta Hook Role'
);

insert into public.beta_auth_allowlist (email, expires_at, operator_note, created_at)
values
  ('allowlisted-adult@example.test', now() + interval '1 day', 'pgTAP explicit allow', now() - interval '1 hour'),
  ('expired-adult@example.test', now() - interval '1 hour', 'pgTAP expired allow', now() - interval '2 hours');

insert into public.organisation_invites (
  organisation_id, email, role_id, scope_kind, scope_id, token_digest, expires_at, accepted_at, created_at
)
values
  (
    '00000000-0000-4000-8000-000000019101',
    'invited-adult@example.test',
    '00000000-0000-4000-8000-000000019102',
    'organisation',
    '00000000-0000-4000-8000-000000019101',
    repeat('1', 64),
    now() + interval '1 day',
    null,
    now() - interval '1 hour'
  ),
  (
    '00000000-0000-4000-8000-000000019101',
    'accepted-adult@example.test',
    '00000000-0000-4000-8000-000000019102',
    'organisation',
    '00000000-0000-4000-8000-000000019101',
    repeat('2', 64),
    now() + interval '1 day',
    now(),
    now() - interval '1 hour'
  ),
  (
    '00000000-0000-4000-8000-000000019101',
    'expired-invitee@example.test',
    '00000000-0000-4000-8000-000000019102',
    'organisation',
    '00000000-0000-4000-8000-000000019101',
    repeat('3', 64),
    now() - interval '1 hour',
    null,
    now() - interval '2 hours'
  );

select is(
  public.hook_restrict_beta_signup(
    jsonb_build_object(
      'user', jsonb_build_object(
        'email', ' Allowlisted-Adult@Example.Test ',
        'app_metadata', jsonb_build_object('provider', 'google')
      )
    )
  ) -> 'error',
  null,
  'an active explicit allowlist entry permits Google account creation'
);
select is(
  public.hook_restrict_beta_signup(
    jsonb_build_object(
      'user', jsonb_build_object(
        'email', 'invited-adult@example.test',
        'app_metadata', jsonb_build_object('provider', 'google')
      )
    )
  ) -> 'error',
  null,
  'an unaccepted unexpired invitation permits Google account creation'
);
select is(
  public.hook_restrict_beta_signup(
    jsonb_build_object(
      'user', jsonb_build_object(
        'email', 'expired-adult@example.test',
        'app_metadata', jsonb_build_object('provider', 'google')
      )
    )
  ) #>> '{error,http_code}',
  '403',
  'an expired explicit allowlist entry is denied'
);
select is(
  public.hook_restrict_beta_signup(
    jsonb_build_object(
      'user', jsonb_build_object(
        'email', 'accepted-adult@example.test',
        'app_metadata', jsonb_build_object('provider', 'google')
      )
    )
  ) #>> '{error,http_code}',
  '403',
  'an accepted invitation is denied'
);
select is(
  public.hook_restrict_beta_signup(
    jsonb_build_object(
      'user', jsonb_build_object(
        'email', 'expired-invitee@example.test',
        'app_metadata', jsonb_build_object('provider', 'google')
      )
    )
  ) #>> '{error,http_code}',
  '403',
  'an expired invitation is denied'
);
select is(
  public.hook_restrict_beta_signup(
    jsonb_build_object(
      'user', jsonb_build_object(
        'email', 'allowlisted-adult@example.test',
        'app_metadata', jsonb_build_object('provider', 'github')
      )
    )
  ) #>> '{error,http_code}',
  '403',
  'a non-Google provider is denied even for an allowlisted address'
);
select is(
  public.hook_restrict_beta_signup(
    jsonb_build_object('user', jsonb_build_object('app_metadata', jsonb_build_object('provider', 'google')))
  ) #>> '{error,http_code}',
  '403',
  'a missing email is denied'
);
select is(
  public.hook_restrict_beta_signup(
    jsonb_build_object(
      'user', jsonb_build_object(
        'email', 'not-an-email',
        'app_metadata', jsonb_build_object('provider', 'google')
      )
    )
  ) #>> '{error,http_code}',
  '403',
  'a malformed email is denied'
);
select is(
  public.hook_restrict_beta_signup(
    jsonb_build_object(
      'user', jsonb_build_object(
        'email', 'unknown-adult@example.test',
        'app_metadata', jsonb_build_object('provider', 'google')
      )
    )
  ) #>> '{error,message}',
  'Beta access is by invitation only.',
  'every denial has the same generic message'
);
select ok(
  not has_table_privilege('anon', 'public.beta_auth_allowlist', 'SELECT')
    and not has_table_privilege('authenticated', 'public.beta_auth_allowlist', 'SELECT')
    and has_table_privilege('service_role', 'public.beta_auth_allowlist', 'SELECT')
    and has_table_privilege('service_role', 'public.beta_auth_allowlist', 'INSERT')
    and has_table_privilege('service_role', 'public.beta_auth_allowlist', 'UPDATE')
    and has_table_privilege('service_role', 'public.beta_auth_allowlist', 'DELETE')
    and not exists (
      select 1
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      cross join lateral aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) privilege
      where namespace.nspname = 'public'
        and relation.relname = 'beta_auth_allowlist'
        and privilege.grantee = 0
    ),
  'only the service role can manage the private allowlist table'
);
select ok(
  not has_function_privilege('anon', 'public.hook_restrict_beta_signup(jsonb)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.hook_restrict_beta_signup(jsonb)', 'EXECUTE')
    and has_function_privilege('supabase_auth_admin', 'public.hook_restrict_beta_signup(jsonb)', 'EXECUTE')
    and not exists (
      select 1
      from pg_proc proc
      join pg_namespace namespace on namespace.oid = proc.pronamespace
      cross join lateral aclexplode(coalesce(proc.proacl, acldefault('f', proc.proowner))) privilege
      where namespace.nspname = 'public'
        and proc.proname = 'hook_restrict_beta_signup'
        and privilege.grantee = 0
        and privilege.privilege_type = 'EXECUTE'
    ),
  'only Supabase Auth can execute the account-creation hook'
);

select * from finish();
rollback;
