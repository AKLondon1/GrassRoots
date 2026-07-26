import { createHash } from "node:crypto";

export async function digestOneTimeToken(rawToken: string): Promise<string> {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

interface TokenRecord {
  tokenDigest: string;
  subjectId: string;
  expiresAt: string;
  consumedAt: string | null;
}

export class OneTimeTokenRegistry {
  private readonly records = new Map<string, TokenRecord>();

  async issue(input: { rawToken: string; subjectId: string; expiresAt: string }): Promise<void> {
    if (!input.rawToken || !input.subjectId || Number.isNaN(Date.parse(input.expiresAt))) throw new Error("A valid secure-link scope is required.");
    const tokenDigest = await digestOneTimeToken(input.rawToken);
    this.records.set(tokenDigest, { tokenDigest, subjectId: input.subjectId, expiresAt: input.expiresAt, consumedAt: null });
  }

  async consume(rawToken: string, now = new Date().toISOString()): Promise<{ subjectId: string }> {
    const digest = await digestOneTimeToken(rawToken);
    const record = this.records.get(digest);
    if (!record || record.consumedAt || new Date(now) >= new Date(record.expiresAt)) throw new Error("This secure link is unavailable.");
    record.consumedAt = now;
    return { subjectId: record.subjectId };
  }

  snapshot(): ReadonlyArray<Readonly<TokenRecord>> {
    return [...this.records.values()].map((record) => ({ ...record }));
  }
}
