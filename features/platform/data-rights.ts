interface ExportRecord {
  type: string;
  id: string;
  organisationId: string;
  ownerUserId: string;
  data: Record<string, unknown>;
}

interface DeletionJob {
  userId: string;
  requestedAt: string;
  deleteAfter: string;
  retentionHoldUntil: string | null;
  status: "scheduled" | "retention-hold" | "queued";
}

const exportFields: Readonly<Record<string, ReadonlySet<string>>> = {
  membership: new Set(["displayName", "status", "createdAt"]),
  message: new Set(["createdAt"]),
  invoice: new Set(["invoiceNumber", "status", "totalPence", "dueOn"]),
  consent: new Set(["decision", "respondedAt", "withdrawnAt"]),
};

function pickExportFields(type: string, data: Record<string, unknown>) {
  const allowed = exportFields[type] ?? new Set<string>();
  return Object.fromEntries(Object.entries(data).filter(([key]) => allowed.has(key)));
}

export class DataRightsService {
  private readonly jobs: DeletionJob[] = [];

  createExport(input: { userId: string; organisationId: string; records: readonly ExportRecord[] }) {
    return {
      format: "json" as const,
      organisationId: input.organisationId,
      userId: input.userId,
      records: input.records
        .filter((record) => record.organisationId === input.organisationId && record.ownerUserId === input.userId && Object.hasOwn(exportFields, record.type))
        .map((record) => ({ type: record.type, id: record.id, data: pickExportFields(record.type, record.data) })),
    };
  }

  scheduleAccountDeletion(input: { userId: string; requestedAt: string; retentionHoldUntil?: string }) {
    const requested = new Date(input.requestedAt);
    const deleteAfter = new Date(requested);
    deleteAfter.setUTCDate(deleteAfter.getUTCDate() + 30);
    const hold = input.retentionHoldUntil ?? null;
    const job: DeletionJob = { userId: input.userId, requestedAt: requested.toISOString(), deleteAfter: deleteAfter.toISOString(), retentionHoldUntil: hold, status: hold && new Date(hold) > deleteAfter ? "retention-hold" : "scheduled" };
    this.jobs.push(job);
    return { ...job };
  }

  releaseEligible(now: string) {
    const current = new Date(now).getTime();
    return this.jobs.flatMap((job) => {
      const eligibleAt = Math.max(new Date(job.deleteAfter).getTime(), job.retentionHoldUntil ? new Date(job.retentionHoldUntil).getTime() : 0);
      if (job.status === "queued" || current < eligibleAt) return [];
      job.status = "queued";
      return [{ ...job }];
    });
  }
}
