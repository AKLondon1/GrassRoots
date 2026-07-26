import { timingSafeEqual } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { environment } from "@/lib/env";
import { assertSameOriginMutation } from "@/lib/security/request";
import { consumeDistributedRateLimit, distributedRateLimitHeaders } from "@/lib/security/server-rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deliverNotification } from "@/lib/providers/notifications";
import { scanPrivateFile } from "@/lib/providers/scanner";

interface BackgroundJob { id: string; organisation_id: string | null; kind: "export" | "account-deletion" | "organisation-deletion" | "retention" | "delivery"; resource_id: string | null; attempt_count: number }
interface KeysetResult { data: unknown; error: { message: string } | null }

async function collectKeysetPages(
  fetchPage: (afterId: string | undefined) => PromiseLike<KeysetResult>,
  failureCode: string,
  batchSize = 500,
) {
  const collected: Array<Record<string, unknown> & { id: string }> = [];
  let afterId: string | undefined;
  for (;;) {
    const { data, error } = await fetchPage(afterId);
    if (error) throw new Error(failureCode);
    const page = (data ?? []) as Array<Record<string, unknown> & { id: string }>;
    collected.push(...page);
    if (page.length < batchSize) return collected;
    const nextId = page.at(-1)?.id;
    if (!nextId || nextId === afterId) throw new Error(`${failureCode}-cursor-stalled`);
    afterId = nextId;
  }
}

function authorised(request: Request) {
  const expected = environment.server.CRON_SECRET;
  const received = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !received) return false;
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

export async function POST(request: Request) {
  assertSameOriginMutation(request, { trustedNonBrowser: true });
  if (!environment.server.CRON_SECRET) return NextResponse.json({ error: "The job runner is not configured." }, { status: 503 });
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "The service database is unavailable." }, { status: 503 });
  const db = admin as unknown as SupabaseClient;
  let limit;
  try { limit = await consumeDistributedRateLimit(db, "internal-job-runner", { limit: 12, windowSeconds: 60 }); }
  catch { return NextResponse.json({ error: "Request protection is temporarily unavailable." }, { status: 503 }); }
  if (!limit.allowed) return NextResponse.json({ error: "The job runner is temporarily rate limited." }, { status: 429, headers: distributedRateLimitHeaders(limit, 12) });
  const { data: expiredExports, error: expiryQueryError } = await db.from("data_export_requests").select("id,storage_path").eq("status", "ready").lt("expires_at", new Date().toISOString()).not("storage_path", "is", null).order("id").limit(100);
  if (expiryQueryError) return NextResponse.json({ error: "Expired exports could not be inspected." }, { status: 500 });
  const expiredPaths = ((expiredExports ?? []) as Array<{ id: string; storage_path: string }>).map(({ storage_path }) => storage_path);
  if (expiredPaths.length) {
    const { error: removeError } = await admin.storage.from("grassroots-private-exports").remove(expiredPaths);
    if (removeError) return NextResponse.json({ error: "Expired export objects could not be removed." }, { status: 500 });
    const { error: expireError } = await db.from("data_export_requests").update({ status: "expired", storage_path: null }).in("id", ((expiredExports ?? []) as Array<{ id: string }>).map(({ id }) => id));
    if (expireError) return NextResponse.json({ error: "Expired export records could not be updated." }, { status: 500 });
  }
  const { data: failedExports, error: failedExportQueryError } = await db.from("data_export_requests").select("id,storage_path").eq("status", "failed").not("storage_path", "is", null).order("id").limit(100);
  if (failedExportQueryError) return NextResponse.json({ error: "Failed export objects could not be inspected." }, { status: 500 });
  const failedPaths = ((failedExports ?? []) as Array<{ id: string; storage_path: string }>).map(({ storage_path }) => storage_path);
  if (failedPaths.length) {
    const { error: removeError } = await admin.storage.from("grassroots-private-exports").remove(failedPaths);
    if (removeError) return NextResponse.json({ error: "Failed export objects could not be removed." }, { status: 500 });
    const { error: clearError } = await db.from("data_export_requests").update({ storage_path: null }).in("id", ((failedExports ?? []) as Array<{ id: string }>).map(({ id }) => id));
    if (clearError) return NextResponse.json({ error: "Failed export paths could not be cleared." }, { status: 500 });
  }
  const { error: holdReleaseError } = await db.rpc("release_expired_account_deletion_holds");
  if (holdReleaseError) return NextResponse.json({ error: "Expired deletion holds could not be released safely." }, { status: 500 });
  const { error: retentionError } = await db.rpc("enqueue_due_retention_jobs");
  if (retentionError) return NextResponse.json({ error: "Retention jobs could not be queued." }, { status: 500 });
  await processQuarantinedUploads(admin, db);
  const { data, error } = await db.rpc("lease_background_jobs", { requested_limit: 20 });
  if (error) return NextResponse.json({ error: "Jobs could not be leased." }, { status: 500 });
  const jobs = (data ?? []) as BackgroundJob[];
  const results: Array<{ id: string; status: "complete" | "failed" }> = [];
  for (const job of jobs) {
    try {
      await processJob(admin, db, job);
      await db.rpc("finish_background_job", { requested_job_id: job.id, requested_success: true, requested_error_code: null });
      results.push({ id: job.id, status: "complete" });
    } catch (cause) {
      const code = cause instanceof Error ? cause.message.replace(/[^a-z0-9._-]+/gi, "-").slice(0, 80) : "worker-failed";
      await db.rpc("finish_background_job", { requested_job_id: job.id, requested_success: false, requested_error_code: code });
      if (job.kind === "delivery" && job.resource_id) await db.from("communication_deliveries").update({ status: "failed", error_code: code, updated_at: new Date().toISOString() }).eq("id", job.resource_id);
      if (job.kind === "export" && job.resource_id && job.attempt_count >= 8) await db.from("data_export_requests").update({ status: "failed" }).eq("id", job.resource_id);
      results.push({ id: job.id, status: "failed" });
    }
  }
  return NextResponse.json({ leased: jobs.length, results });
}

async function processQuarantinedUploads(admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, db: SupabaseClient) {
  if (!environment.server.SCANNER_API_URL || !environment.server.SCANNER_API_TOKEN) return;
  const { data, error } = await db.from("private_upload_intents").select("id,storage_path,original_filename,declared_mime").eq("status", "quarantined").order("uploaded_at").limit(10);
  if (error) throw new Error("quarantine-scan-query-failed");
  for (const intent of (data ?? []) as Array<{ id: string; storage_path: string; original_filename: string; declared_mime: string }>) {
    const { data: claimed, error: claimError } = await db.from("private_upload_intents").update({ status: "scanning" }).eq("id", intent.id).eq("status", "quarantined").select("id").maybeSingle();
    if (claimError || !claimed) continue;
    try {
      const { data: file, error: downloadError } = await admin.storage.from("grassroots-private-quarantine").download(intent.storage_path);
      if (downloadError || !file) throw new Error("quarantine-object-unavailable");
      const verdict = await scanPrivateFile(file, { filename: intent.original_filename, mime: intent.declared_mime });
      const { data: recorded, error: recordError } = await db.rpc("record_private_upload_scan", { requested_intent_id: intent.id, requested_clean: verdict.clean, requested_scanner_reference: verdict.engine });
      if (recordError || recorded !== true) throw new Error("quarantine-verdict-update-failed");
      if (!verdict.clean) await admin.storage.from("grassroots-private-quarantine").remove([intent.storage_path]);
    } catch {
      await db.from("private_upload_intents").update({ status: "quarantined" }).eq("id", intent.id).eq("status", "scanning");
    }
  }
}

async function processJob(admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, db: SupabaseClient, job: BackgroundJob) {
  if (!job.resource_id) throw new Error("missing-resource-id");
  if (job.kind === "delivery") {
    const { data: delivery, error } = await db.from("communication_deliveries").select("id,organisation_id,recipient_membership_id,resource_type,resource_id,channel,idempotency_key").eq("id", job.resource_id).single();
    if (error || !delivery) throw new Error("delivery-unavailable");
    if (delivery.channel === "in-app") {
      const { error: updateError } = await db.from("communication_deliveries").update({ status: "sent", provider: "internal", updated_at: new Date().toISOString() }).eq("id", job.resource_id);
      if (updateError) throw new Error("delivery-update-failed");
      return;
    }
    if (delivery.channel !== "email" && delivery.channel !== "push") throw new Error("unsupported-delivery-channel");
    if (delivery.resource_type !== "announcement" || !delivery.resource_id) throw new Error("unsupported-delivery-resource");
    const [{ data: announcement, error: announcementError }, { data: membership, error: membershipError }] = await Promise.all([
      db.from("announcements").select("title,body,status").eq("organisation_id", delivery.organisation_id).eq("id", delivery.resource_id).single(),
      db.from("memberships").select("user_id,status").eq("organisation_id", delivery.organisation_id).eq("id", delivery.recipient_membership_id).single(),
    ]);
    if (announcementError || !announcement || announcement.status !== "published") throw new Error("delivery-content-unavailable");
    if (membershipError || !membership || membership.status !== "active" || !membership.user_id) throw new Error("delivery-recipient-unavailable");
    let recipientEmail: string | undefined;
    if (delivery.channel === "email") {
      const { data: authUser, error: authError } = await admin.auth.admin.getUserById(membership.user_id);
      if (authError || !authUser.user.email) throw new Error("delivery-email-unavailable");
      recipientEmail = authUser.user.email;
    }
    const sent = await deliverNotification({ channel: delivery.channel, recipientEmail, recipientMembershipId: delivery.recipient_membership_id, subject: announcement.title, body: announcement.body, idempotencyKey: delivery.idempotency_key });
    const { error: updateError } = await db.from("communication_deliveries").update({ status: "sent", provider: sent.provider, provider_reference: sent.reference, error_code: null, updated_at: new Date().toISOString() }).eq("id", job.resource_id);
    if (updateError) throw new Error("delivery-update-failed");
    return;
  }
  if (job.kind === "export") {
    const { data: exportRequest, error } = await db.from("data_export_requests").select("id,organisation_id,subject_user_id,scope,requested_at").eq("id", job.resource_id).single();
    if (error || !exportRequest) throw new Error("export-request-unavailable");
    const { data: profile, error: profileError } = await db.from("profiles").select("display_name,account_type,created_at").eq("id", exportRequest.subject_user_id).maybeSingle();
    if (profileError) throw new Error("export-identity-query-failed");
    const memberships = await collectKeysetPages((afterId) => {
      let query = db.from("memberships").select("id,status,joined_at").eq("organisation_id", exportRequest.organisation_id).eq("user_id", exportRequest.subject_user_id).order("id").limit(500);
      if (afterId) query = query.gt("id", afterId);
      return query;
    }, "export-membership-query-failed");
    const membershipIds = memberships.map(({ id }) => id);
    const [preferences, messages, guardians] = membershipIds.length ? await Promise.all([
      collectKeysetPages((afterId) => { let query = db.from("communication_preferences").select("id,email_enabled,push_enabled,availability_reminders,payment_receipts,updated_at").eq("organisation_id", exportRequest.organisation_id).in("membership_id", membershipIds).order("id").limit(500); if (afterId) query = query.gt("id", afterId); return query; }, "export-preference-query-failed"),
      collectKeysetPages((afterId) => { let query = db.from("conversation_messages").select("id,conversation_id,body,moderation_state,created_at,edited_at").eq("organisation_id", exportRequest.organisation_id).in("author_membership_id", membershipIds).order("id").limit(500); if (afterId) query = query.gt("id", afterId); return query; }, "export-message-query-failed"),
      collectKeysetPages((afterId) => { let query = db.from("guardians").select("id,status").eq("organisation_id", exportRequest.organisation_id).in("membership_id", membershipIds).order("id").limit(500); if (afterId) query = query.gt("id", afterId); return query; }, "export-guardian-query-failed"),
    ]) : [[], [], []];
    const guardianIds = guardians.map(({ id }) => id);
    const links = guardianIds.length ? await collectKeysetPages((afterId) => { let query = db.from("player_guardians").select("id,household_id,player_id,guardian_id,relationship,guardian_permissions(communication,payments,consent,emergency_contact,restricted_contact)").eq("organisation_id", exportRequest.organisation_id).in("guardian_id", guardianIds).order("id").limit(500); if (afterId) query = query.gt("id", afterId); return query; }, "export-link-query-failed") : [];
    const playerIds = [...new Set((links as unknown as Array<{ player_id: string }>).map(({ player_id }) => player_id))];
    const householdIds = [...new Set((links as unknown as Array<{ household_id: string }>).map(({ household_id }) => household_id))];
    const paged = (table: string, select: string, column: string, ids: string[], failure: string) => ids.length ? collectKeysetPages((afterId) => { let query = db.from(table).select(select).eq("organisation_id", exportRequest.organisation_id).in(column, ids).order("id").limit(500); if (afterId) query = query.gt("id", afterId); return query; }, failure) : Promise.resolve([]);
    const [consents, players, households, availability, invoices, attendance, development, roleAssignments, pollResponses, squadSelections] = await Promise.all([
      paged("consent_responses", "id,definition_version_id,player_id,decision,responded_at,withdrawn_at", "guardian_id", guardianIds, "export-consent-query-failed"),
      paged("players", "id,first_name,last_name,date_of_birth,status,created_at,updated_at", "id", playerIds, "export-player-query-failed"),
      paged("households", "id,name,created_at,updated_at", "id", householdIds, "export-household-query-failed"),
      paged("availability_responses", "id,event_instance_id,player_id,status,note,transport_seats,responded_at,updated_at", "guardian_id", guardianIds, "export-availability-query-failed"),
      paged("member_invoices", "id,invoice_number,status,currency,subtotal_pence,discount_pence,total_pence,due_on,issued_at,paid_at,member_invoice_lines(description,quantity,unit_amount_pence,line_total_pence),member_transactions(amount_pence,currency,provider,status,settled_at,created_at)", "household_id", householdIds, "export-invoice-query-failed"),
      paged("training_attendance", "id,training_session_id,player_id,status,occurred_at,synced_at", "player_id", playerIds, "export-attendance-query-failed"),
      paged("parent_development_summaries", "id,player_id,team_id,summary,current_themes,suggested_activities,term_review,attendance_summary,approved_at", "player_id", playerIds, "export-development-query-failed"),
      paged("scoped_role_assignments", "id,scope_kind,scope_id,resource_type,role_id,created_at", "membership_id", membershipIds, "export-role-query-failed"),
      paged("poll_respondents", "id,poll_id,player_id,created_at,poll_responses(option_id,response,responded_at)", "player_id", playerIds, "export-poll-query-failed"),
      paged("squad_members", "id,squad_id,player_id,status,position_order,created_at,updated_at", "player_id", playerIds, "export-squad-query-failed"),
    ]);
    const path = `${exportRequest.organisation_id}/${exportRequest.id}.json`;
    const body = JSON.stringify({ format: "grassroots-account-export-v3", organisationId: exportRequest.organisation_id, subjectUserId: exportRequest.subject_user_id, scope: exportRequest.scope, requestedAt: exportRequest.requested_at, profile, memberships: memberships ?? [], roleAssignments: roleAssignments ?? [], communicationPreferences: preferences ?? [], authoredMessages: messages ?? [], guardianRecords: guardians ?? [], playerGuardianLinks: links ?? [], households: households ?? [], linkedPlayers: players ?? [], availabilityResponses: availability ?? [], pollResponses: pollResponses ?? [], squadSelections: squadSelections ?? [], consentResponses: consents ?? [], memberInvoices: invoices ?? [], trainingAttendance: attendance ?? [], approvedDevelopmentSummaries: development ?? [], excludedSensitiveBodies: ["player_medical_profiles.clinical_notes","safeguarding_concerns.detail","safeguarding_actions.detail","private_coaching_observations"] });
    const { error: pathError } = await db.from("data_export_requests").update({ status: "processing", storage_path: path }).eq("id", job.resource_id);
    if (pathError) throw new Error("export-path-persistence-failed");
    const { error: uploadError } = await admin.storage.from("grassroots-private-exports").upload(path, body, { contentType: "application/json", upsert: true });
    if (uploadError) {
      await db.from("data_export_requests").update({ status: "failed", storage_path: null }).eq("id", job.resource_id);
      throw new Error("export-storage-failed");
    }
    const { error: updateError } = await db.from("data_export_requests").update({ status: "ready", storage_path: path, expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(), completed_at: new Date().toISOString() }).eq("id", job.resource_id);
    if (updateError) {
      const { error: compensationError } = await admin.storage.from("grassroots-private-exports").remove([path]);
      await db.from("data_export_requests").update({ status: "failed", storage_path: compensationError ? path : null }).eq("id", job.resource_id);
      throw new Error(compensationError ? "export-update-and-compensation-failed" : "export-update-failed");
    }
    return;
  }
  if (job.kind === "account-deletion") {
    const { data: deletion, error } = await db.from("account_deletion_requests").select("user_id,delete_after,status").eq("id", job.resource_id).single();
    if (error || !deletion || deletion.status !== "scheduled" || new Date(deletion.delete_after) > new Date()) throw new Error("account-deletion-not-eligible");
    const exports = await collectKeysetPages((afterId) => { let query = db.from("data_export_requests").select("id,storage_path").eq("subject_user_id", deletion.user_id).not("storage_path", "is", null).order("id").limit(500); if (afterId) query = query.gt("id", afterId); return query; }, "private-export-query-failed");
    await removeStoragePaths(admin, "grassroots-private-exports", exports.map(({ storage_path }) => String(storage_path)), "private-export-erasure-failed");
    const memberships = await collectKeysetPages((afterId) => { let query = db.from("memberships").select("id,organisation_id").eq("user_id", deletion.user_id).order("id").limit(500); if (afterId) query = query.gt("id", afterId); return query; }, "account-private-file-memberships-query-failed");
    for (const membership of memberships) {
      await removePrivateObjects(admin, db, String(membership.organisation_id), membership.id);
    }
    const { error: erasureError } = await db.rpc("prepare_account_erasure", { requested_user_id: deletion.user_id });
    if (erasureError) throw new Error("account-erasure-failed");
    const { error: deleteError } = await admin.auth.admin.deleteUser(String(deletion.user_id));
    if (deleteError) throw new Error("identity-deletion-failed");
    return;
  }
  if (job.kind === "organisation-deletion") {
    if (!job.organisation_id) throw new Error("organisation-id-missing");
    const { data: lifecycle, error } = await db.from("organisation_lifecycle").select("deletion_status,delete_after").eq("organisation_id", job.organisation_id).single();
    if (error || lifecycle?.deletion_status !== "scheduled" || !lifecycle.delete_after || new Date(lifecycle.delete_after) > new Date()) throw new Error("organisation-deletion-not-eligible");
    const exports = await collectKeysetPages((afterId) => { let query = db.from("data_export_requests").select("id,storage_path").eq("organisation_id", job.organisation_id!).not("storage_path", "is", null).order("id").limit(500); if (afterId) query = query.gt("id", afterId); return query; }, "organisation-export-query-failed");
    await removeStoragePaths(admin, "grassroots-private-exports", exports.map(({ storage_path }) => String(storage_path)), "organisation-export-erasure-failed");
    await removePrivateObjects(admin, db, job.organisation_id);
    const { error: deleteError } = await db.from("organisations").delete().eq("id", job.organisation_id);
    if (deleteError) throw new Error("organisation-deletion-failed");
    return;
  }
  if (job.kind === "retention") {
    if (!job.organisation_id) throw new Error("organisation-id-missing");
    await removeExpiredQuarantineObjects(admin, db, job.organisation_id);
    const { error } = await db.rpc("run_retention_sweep", { requested_organisation_id: job.organisation_id });
    if (error) throw new Error("retention-sweep-failed");
    return;
  }
  throw new Error("unsupported-job-kind");
}

async function removePrivateObjects(admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, db: SupabaseClient, organisationId: string, membershipId?: string) {
  const [files, quarantine] = await Promise.all([
    collectKeysetPages((afterId) => { let query = db.from("stored_files").select("id,storage_path").eq("organisation_id", organisationId).not("storage_path", "is", null).order("id").limit(500); if (membershipId) query = query.eq("uploaded_by_membership_id", membershipId); if (afterId) query = query.gt("id", afterId); return query; }, "private-file-inventory-failed"),
    collectKeysetPages((afterId) => { let query = db.from("private_upload_intents").select("id,storage_path").eq("organisation_id", organisationId).neq("status", "promoted").order("id").limit(500); if (membershipId) query = query.eq("actor_membership_id", membershipId); if (afterId) query = query.gt("id", afterId); return query; }, "quarantine-inventory-failed"),
  ]);
  await removeStoragePaths(admin, "grassroots-private-files", files.map(({ storage_path }) => String(storage_path)), "private-file-erasure-failed");
  await removeStoragePaths(admin, "grassroots-private-quarantine", quarantine.map(({ storage_path }) => String(storage_path)), "quarantine-erasure-failed");
}

async function removeStoragePaths(admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, bucket: string, paths: string[], failureCode: string) {
  for (let start = 0; start < paths.length; start += 100) {
    const { error } = await admin.storage.from(bucket).remove(paths.slice(start, start + 100));
    if (error) throw new Error(failureCode);
  }
}

async function removeExpiredQuarantineObjects(admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, db: SupabaseClient, organisationId: string) {
  const { error: expiryError } = await db.rpc("expire_stale_private_upload_intents", { requested_organisation_id: organisationId });
  if (expiryError) throw new Error("stale-quarantine-expiry-failed");
  const expired = await collectKeysetPages((afterId) => { let query = db.from("private_upload_intents").select("id,storage_path").eq("organisation_id", organisationId).in("status", ["rejected", "expired"]).lt("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString()).order("id").limit(500); if (afterId) query = query.gt("id", afterId); return query; }, "expired-quarantine-inventory-failed");
  await removeStoragePaths(admin, "grassroots-private-quarantine", expired.map(({ storage_path }) => String(storage_path)), "expired-quarantine-erasure-failed");
  for (let start = 0; start < expired.length; start += 500) {
    const { error } = await db.from("private_upload_intents").delete().in("id", expired.slice(start, start + 500).map(({ id }) => id));
    if (error) throw new Error("expired-quarantine-record-cleanup-failed");
  }
}
