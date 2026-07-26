export interface FacilityNotice {
  readonly id: string;
  readonly organisationId: string;
  readonly eventInstanceId: string;
  readonly kind: "facility-relocated" | "event-cancelled";
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface FacilityNoticeProvider {
  readonly name: string;
  deliver(notice: FacilityNotice): Promise<{ providerMessageId: string }>;
}

export interface FacilityOutboxStore {
  claimPending(limit: number): Promise<readonly FacilityNotice[]>;
  markSent(id: string, providerMessageId: string): Promise<void>;
  markFailed(id: string, reason: string): Promise<void>;
}

export async function deliverFacilityNotices(store: FacilityOutboxStore, provider: FacilityNoticeProvider, limit = 25) {
  const notices = await store.claimPending(limit);
  for (const notice of notices) {
    try {
      const delivered = await provider.deliver(notice);
      await store.markSent(notice.id, delivered.providerMessageId);
    } catch (error) {
      await store.markFailed(notice.id, error instanceof Error ? error.message : "Provider delivery failed");
    }
  }
  return notices.length;
}

export const developmentFacilityNoticeProvider: FacilityNoticeProvider = {
  name: "development-local-ledger",
  async deliver(notice) {
    return { providerMessageId: `development-local:${notice.id}` };
  },
};
