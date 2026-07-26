import { describe, expect, it } from "vitest";

import { createQuarantinedUpload, validateUploadedFile } from "@/lib/files/upload-boundary";

describe("private file boundary", () => {
  it("accepts an allowlisted file only when MIME and magic bytes agree", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(validateUploadedFile({ bytes: png, declaredMime: "image/png", size: png.byteLength })).toEqual({ mime: "image/png", extension: "png" });
    expect(() => validateUploadedFile({ bytes: png, declaredMime: "application/pdf", size: png.byteLength })).toThrow(/match/i);
  });

  it("rejects executable, oversized and truncated uploads", () => {
    expect(() => validateUploadedFile({ bytes: new Uint8Array([0x4d, 0x5a]), declaredMime: "application/octet-stream", size: 2 })).toThrow(/type/i);
    expect(() => validateUploadedFile({ bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]), declaredMime: "application/pdf", size: 10 * 1024 * 1024 + 1 })).toThrow(/size/i);
    expect(() => validateUploadedFile({ bytes: new Uint8Array(), declaredMime: "image/jpeg", size: 0 })).toThrow(/empty/i);
  });

  it("creates quarantine-only paths and never marks files public before scanning", () => {
    const intent = createQuarantinedUpload({ organisationId: "org-1", actorId: "member-1", filename: "player photo.png", declaredMime: "image/png", size: 1024, nonce: "abc123" });
    expect(intent.storagePath).toBe("org-1/quarantine/abc123.png");
    expect(intent.visibility).toBe("private");
    expect(intent.status).toBe("awaiting-upload");
    expect(intent.originalFilename).toBe("player photo.png");
  });
});
