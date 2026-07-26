import type { SupabaseClient } from "@supabase/supabase-js";

import type { ExportAuditWriter } from "@/features/operations/exports";

export function createSupabaseExportAuditWriter(client: SupabaseClient): ExportAuditWriter {
  return {
    async append(record) {
      const { error } = await client.rpc("record_export_audit", {
        requested_organisation_id: record.organisationId,
        requested_format: record.format,
        requested_resource_type: record.resourceType,
        requested_watermark: record.watermark,
        requested_row_count: record.rowCount,
      });
      if (error) throw new Error("The export audit record could not be saved.");
    },
  };
}
