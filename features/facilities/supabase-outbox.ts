import type { SupabaseClient } from "@supabase/supabase-js";

import type { FacilityNotice, FacilityOutboxStore } from "@/features/facilities/outbox";

export function createSupabaseFacilityOutboxStore(client: SupabaseClient): FacilityOutboxStore {
  return {
    async claimPending(limit) {
      const { data, error } = await client.rpc("claim_facility_notification_outbox", { requested_limit: limit });
      if (error) throw new Error("Facility notices could not be claimed.");
      return ((data ?? []) as Array<{ id: string; organisation_id: string; event_instance_id: string; kind: FacilityNotice["kind"]; payload: Record<string, unknown> }>).map((row) => ({ id: row.id, organisationId: row.organisation_id, eventInstanceId: row.event_instance_id, kind: row.kind, payload: row.payload }));
    },
    async markSent(id, providerMessageId) {
      const { error } = await client.rpc("complete_facility_notification", { requested_notice_id: id, requested_provider_message_id: providerMessageId });
      if (error) throw new Error("Facility notice completion could not be recorded.");
    },
    async markFailed(id, reason) {
      const { error } = await client.rpc("fail_facility_notification", { requested_notice_id: id, requested_reason: reason });
      if (error) throw new Error("Facility notice failure could not be recorded.");
    },
  };
}
