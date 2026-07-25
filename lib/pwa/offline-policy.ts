const publicCachePaths = new Set(["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"]);
const safeOperationKinds = new Set(["ui-preference", "dismiss-install-prompt"]);

export function isPublicCacheRequest(url: URL): boolean {
  return url.search === "" && publicCachePaths.has(url.pathname);
}

export function assertOfflineSafeOperation(operation: { kind: string; payload: Record<string, unknown> }): void {
  if (!safeOperationKinds.has(operation.kind)) {
    throw new Error("This action needs an online connection because it may contain personal or operational data.");
  }
  const serialised = JSON.stringify(operation.payload);
  if (/(?:child|player|guardian|medical|safeguarding|message|payment|consent|email|phone)/i.test(serialised)) {
    throw new Error("This action needs an online connection because it may contain personal or operational data.");
  }
}

export const safePublicCachePaths = Object.freeze([...publicCachePaths]);
