-- Private-beta account creation is restricted before Supabase Auth inserts a user.
-- The initial owner address is deliberately inserted after deployment, never in Git.

create table public.beta_auth_allowlist (
  email text primary key check (
    email = lower(btrim(email))
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
  ),
  expires_at timestamptz not null,
  operator_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at)
);

comment on table public.beta_auth_allowlist is
  'Private, expiring operator allowlist for new beta account creation.';

create index beta_auth_allowlist_expiry_idx
  on public.beta_auth_allowlist (expires_at);

create trigger beta_auth_allowlist_set_updated_at
before update on public.beta_auth_allowlist
for each row execute function public.set_updated_at();

alter table public.beta_auth_allowlist enable row level security;

create function public.hook_restrict_beta_signup(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_email text := lower(btrim(coalesce(event -> 'user' ->> 'email', '')));
  provider text := event -> 'user' -> 'app_metadata' ->> 'provider';
  is_permitted boolean := false;
begin
  if coalesce(provider, '') <> 'google'
    or candidate_email = ''
    or candidate_email !~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$' then
    return jsonb_build_object(
      'error',
      jsonb_build_object('http_code', 403, 'message', 'Beta access is by invitation only.')
    );
  end if;

  select exists (
    select 1
    from public.beta_auth_allowlist allowlist
    where allowlist.email = candidate_email
      and allowlist.expires_at > now()
  ) or exists (
    select 1
    from public.organisation_invites invitation
    where invitation.email = candidate_email
      and invitation.accepted_at is null
      and invitation.expires_at > now()
  ) into is_permitted;

  if not is_permitted then
    return jsonb_build_object(
      'error',
      jsonb_build_object('http_code', 403, 'message', 'Beta access is by invitation only.')
    );
  end if;

  return event;
end;
$$;

revoke all on table public.beta_auth_allowlist from public, anon, authenticated, supabase_auth_admin;
revoke all on function public.hook_restrict_beta_signup(jsonb) from public, anon, authenticated, service_role;

grant select, insert, update, delete on table public.beta_auth_allowlist to service_role;
grant execute on function public.hook_restrict_beta_signup(jsonb) to supabase_auth_admin;
