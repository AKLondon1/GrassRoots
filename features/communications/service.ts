import { notificationDedupeKey } from "@/features/communications/notifications";

export interface DevelopmentNotification {
  readonly organisationId: string;
  readonly householdId: string;
  readonly eventId: string;
  readonly template: string;
  readonly destination: string;
  readonly scheduledFor: string;
  readonly body: string;
}

export interface DevelopmentOutboxEntry extends DevelopmentNotification {
  readonly id: string;
  readonly dedupeKey: string;
  readonly deliveryStatus: "not-sent";
  readonly provider: "development-outbox";
}

export interface NotificationProvider {
  readonly mode: "development" | "production";
  readonly channels: readonly ("email" | "push")[];
  enqueue(notification: DevelopmentNotification): Promise<DevelopmentOutboxEntry>;
}

export class DevNotificationOutbox implements NotificationProvider {
  readonly mode = "development" as const;
  readonly channels = ["email", "push"] as const;
  private readonly entries = new Map<string, DevelopmentOutboxEntry>();

  async enqueue(notification: DevelopmentNotification): Promise<DevelopmentOutboxEntry> {
    const dedupeKey = notificationDedupeKey(notification);
    const existing = this.entries.get(dedupeKey);
    if (existing) return existing;
    const entry = Object.freeze({
      ...notification,
      id: `dev-${dedupeKey.slice(0, 16)}`,
      dedupeKey,
      deliveryStatus: "not-sent" as const,
      provider: "development-outbox" as const,
    });
    this.entries.set(dedupeKey, entry);
    return entry;
  }

  list(): readonly DevelopmentOutboxEntry[] {
    return [...this.entries.values()];
  }
}
