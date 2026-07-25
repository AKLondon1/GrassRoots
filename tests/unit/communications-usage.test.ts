import { describe, expect, it } from "vitest";

import { createDeliveryMetadata } from "@/features/communications/privacy";
import { UsageMeter } from "@/features/platform/usage";

describe("communication privacy and usage metering", () => {
  it("excludes body content from delivery metadata", () => {
    expect(createDeliveryMetadata({ resourceType: "message", resourceId: "message-1", channel: "email", body: "Private body" })).toEqual({ resourceType: "message", resourceId: "message-1", channel: "email" });
  });

  it("meters provider counts separately from member money", () => {
    const meter = new UsageMeter();
    meter.record({ organisationId: "org-1", metric: "email", quantity: 3, idempotencyKey: "emails:batch-1" });
    meter.record({ organisationId: "org-1", metric: "email", quantity: 3, idempotencyKey: "emails:batch-1" });
    expect(meter.total("org-1", "email")).toBe(3);
    expect(JSON.stringify(meter.records)).not.toMatch(/invoice|payment|body/i);
  });
});
