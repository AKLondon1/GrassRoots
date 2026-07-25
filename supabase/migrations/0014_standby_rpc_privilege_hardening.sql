-- Standby state changes are atomic RPC operations, never direct table updates.

revoke update on public.squad_members, public.standby_replacements from authenticated;
