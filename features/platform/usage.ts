export interface UsageRecord {
  organisationId: string;
  metric: "email" | "push" | "ai-suggestion" | "storage-bytes";
  quantity: number;
  idempotencyKey: string;
}

export class UsageMeter {
  readonly records: UsageRecord[] = [];
  private readonly keys = new Set<string>();

  record(input: UsageRecord) {
    if (!Number.isSafeInteger(input.quantity) || input.quantity < 0) throw new Error("Usage quantity must be a non-negative integer.");
    const key = `${input.organisationId}:${input.idempotencyKey}`;
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    this.records.push({ ...input });
    return true;
  }

  total(organisationId: string, metric: UsageRecord["metric"]) {
    return this.records.filter((record) => record.organisationId === organisationId && record.metric === metric).reduce((sum, record) => sum + record.quantity, 0);
  }
}
