-- Supabase Auth invokes the Before User Created hook as supabase_auth_admin.
-- The hook itself and its table access remain governed by the 0018 grants.
grant usage on schema public to supabase_auth_admin;
