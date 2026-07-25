import { randomUUID } from "node:crypto";

const MAX_PRIVATE_UPLOAD_BYTES = 10 * 1024 * 1024;

const allowedTypes = {
  "image/png": { extension: "png", signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  "image/jpeg": { extension: "jpg", signature: [0xff, 0xd8, 0xff] },
  "application/pdf": { extension: "pdf", signature: [0x25, 0x50, 0x44, 0x46, 0x2d] },
} as const;

type AllowedMime = keyof typeof allowedTypes;

function normaliseFilename(value: string): string {
  const name = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f/\\]/g, "").trim().slice(0, 120);
  if (!name || name === "." || name === "..") throw new Error("A safe original filename is required.");
  return name;
}

export function validateUploadedFile(input: { bytes: Uint8Array; declaredMime: string; size: number }): { mime: AllowedMime; extension: string } {
  if (input.size < 1 || input.bytes.byteLength < 1) throw new Error("Empty files cannot be uploaded.");
  if (input.size > MAX_PRIVATE_UPLOAD_BYTES) throw new Error("The file size exceeds the 10 MB limit.");
  if (!Object.hasOwn(allowedTypes, input.declaredMime)) throw new Error("This file type is not allowed.");
  const mime = input.declaredMime as AllowedMime;
  const expected = allowedTypes[mime];
  const matches = expected.signature.every((byte, index) => input.bytes[index] === byte);
  if (!matches) throw new Error("The file content does not match its declared type.");
  return { mime, extension: expected.extension };
}

export function createQuarantinedUpload(input: {
  organisationId: string;
  actorId: string;
  filename: string;
  declaredMime: string;
  size: number;
  nonce?: string;
}) {
  if (!input.organisationId.trim() || !input.actorId.trim()) throw new Error("Upload tenancy and actor scope are required.");
  if (!Object.hasOwn(allowedTypes, input.declaredMime)) throw new Error("This file type is not allowed.");
  if (input.size < 1 || input.size > MAX_PRIVATE_UPLOAD_BYTES) throw new Error("The file size must be between 1 byte and 10 MB.");
  const mime = input.declaredMime as AllowedMime;
  const nonce = (input.nonce ?? randomUUID()).replace(/[^a-zA-Z0-9-]/g, "");
  if (!nonce) throw new Error("A safe upload identifier is required.");
  return {
    organisationId: input.organisationId,
    actorId: input.actorId,
    originalFilename: normaliseFilename(input.filename),
    declaredMime: mime,
    size: input.size,
    storagePath: `${input.organisationId}/quarantine/${nonce}.${allowedTypes[mime].extension}`,
    visibility: "private" as const,
    status: "awaiting-upload" as const,
  };
}

export const uploadPolicy = {
  maxBytes: MAX_PRIVATE_UPLOAD_BYTES,
  allowedMimeTypes: Object.freeze(Object.keys(allowedTypes) as AllowedMime[]),
  quarantineBucket: "grassroots-private-quarantine",
} as const;
