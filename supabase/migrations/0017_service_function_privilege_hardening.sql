-- Supabase grants functions to authenticated by default; server-only RPCs must opt out.

revoke all on function
  public.consume_magic_response_token(text),
  public.issue_magic_availability_token(uuid,uuid,uuid,uuid,text,timestamptz),
  public.get_magic_availability_context(text),
  public.submit_magic_availability_response(text,public.availability_status,text,smallint),
  public.consume_rate_limit(text,integer,integer),
  public.release_expired_account_deletion_holds(),
  public.mark_private_upload_quarantined(uuid,text),
  public.record_private_upload_scan(uuid,boolean,text),
  public.reject_private_upload_intent(uuid,text),
  public.expire_stale_private_upload_intents(uuid),
  public.register_promoted_private_document(uuid,text,text)
from authenticated;
