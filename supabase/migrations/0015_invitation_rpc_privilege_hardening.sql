-- Invitation issuance and acceptance are RPC-only operations.

revoke insert, update, delete on public.organisation_invites from authenticated;
