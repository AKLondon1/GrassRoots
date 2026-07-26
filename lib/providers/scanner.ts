import "server-only";

import { environment } from "@/lib/env";

export async function scanPrivateFile(file: Blob, metadata: { filename: string; mime: string }): Promise<{ clean: boolean; engine: string }> {
  if (!environment.server.SCANNER_API_URL || !environment.server.SCANNER_API_TOKEN) throw new Error("scanner-provider-unconfigured");
  const response = await fetch(environment.server.SCANNER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${environment.server.SCANNER_API_TOKEN}`,
      "Content-Type": metadata.mime || "application/octet-stream",
      "X-Filename": encodeURIComponent(metadata.filename).slice(0, 500),
    },
    body: await file.arrayBuffer(),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`scanner-provider-${response.status}`);
  const result = await response.json() as { clean?: unknown; engine?: unknown };
  if (typeof result.clean !== "boolean" || typeof result.engine !== "string" || !result.engine.trim()) throw new Error("scanner-provider-invalid-response");
  return { clean: result.clean, engine: result.engine.trim().slice(0, 120) };
}
