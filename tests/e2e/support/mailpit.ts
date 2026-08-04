const MAILPIT_API = "http://127.0.0.1:54324/api/v1";
const LOCAL_AUTH_ORIGINS = new Set([
  "http://localhost:54321",
  "http://127.0.0.1:54321",
]);
const LOCAL_VERIFY_PATH = "/auth/v1/verify";
const POLL_INTERVAL_MS = 250;

interface MailpitBody {
  Text?: string;
  HTML?: string;
}

interface MailpitSummary {
  ID?: string;
  To?: Array<{ Address?: string }>;
  Created?: string;
}

interface MailpitList {
  messages?: MailpitSummary[];
}

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
  };

  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|(amp|apos|gt|lt|quot));/gi,
    (entity, decimal: string | undefined, hexadecimal: string | undefined, name: string | undefined) => {
      if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
      if (hexadecimal) return String.fromCodePoint(Number.parseInt(hexadecimal, 16));
      return name ? named[name.toLowerCase()] ?? entity : entity;
    },
  );
}

export function extractLocalConfirmationUrl(message: MailpitBody) {
  const body = decodeHtmlEntities(`${message.Text ?? ""}\n${message.HTML ?? ""}`);
  const candidates = body.match(/https?:\/\/[^\s"'<>]+/g) ?? [];

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (LOCAL_AUTH_ORIGINS.has(url.origin) && url.pathname === LOCAL_VERIFY_PATH) {
        return url.toString();
      }
    } catch {
      // Keep looking: email bodies can contain prose that merely resembles a URL.
    }
  }

  throw new Error("Mailpit message did not contain an allowed local confirmation link.");
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) {
    throw new Error(`Mailpit request failed with status ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

export async function waitForMagicLink({
  email,
  requestedAfter,
  timeoutMs,
}: {
  email: string;
  requestedAfter: Date;
  timeoutMs: number;
}) {
  const startedAt = Date.now();
  const notBefore = requestedAfter.getTime();

  while (Date.now() - startedAt <= timeoutMs) {
    const list = await fetchJson<MailpitList>(`${MAILPIT_API}/messages`);
    const message = (list.messages ?? [])
      .filter(
        (candidate) =>
          candidate.ID &&
          candidate.To?.some((recipient) => recipient.Address === email) &&
          candidate.Created &&
          Date.parse(candidate.Created) >= notBefore,
      )
      .sort(
        (left, right) =>
          Date.parse(right.Created ?? "") - Date.parse(left.Created ?? ""),
      )[0];

    if (message?.ID) {
      const detail = await fetchJson<MailpitBody>(
        `${MAILPIT_API}/message/${encodeURIComponent(message.ID)}`,
      );
      return extractLocalConfirmationUrl(detail);
    }

    await delay(Math.min(POLL_INTERVAL_MS, Math.max(0, timeoutMs - (Date.now() - startedAt))));
  }

  throw new Error(
    `No fresh magic-link email arrived for ${email} within ${Date.now() - startedAt}ms.`,
  );
}
