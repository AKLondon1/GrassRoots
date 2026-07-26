import { createCalendarFeed, type CalendarFeedRepository } from "@/features/events/service";
import { DemoRepository } from "@/lib/demo/repository";
import { createRiversideDemoSeed } from "@/lib/demo/seed";
import { environment } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface CalendarRouteContext {
  params: Promise<{ token: string }>;
}

function calendarResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
      "content-disposition": 'inline; filename="grassroots.ics"',
      "x-content-type-options": "nosniff",
    },
  });
}

function notFoundResponse() {
  return new Response("Calendar not found", {
    status: 404,
    headers: { "cache-control": "private, no-store, max-age=0" },
  });
}

async function productionCalendarRepository(): Promise<CalendarFeedRepository | null> {
  const client = await createServerSupabaseClient();
  if (!client) return null;
  const rpcClient = client as unknown as {
    rpc(name: string, args: Record<string, string>): Promise<{ data: unknown; error: { message: string } | null }>;
  };
  let digest = "";
  return {
    async findCalendarToken(tokenHash) {
      digest = tokenHash;
      const { data, error } = await rpcClient.rpc("resolve_private_calendar_token", { requested_digest: tokenHash });
      if (error) throw new Error("Calendar lookup failed.");
      const record = (Array.isArray(data) ? data[0] : null) as { token_id: string; organisation_id: string } | undefined;
      return record ? { id: record.token_id, organisationId: record.organisation_id, tokenHash, revokedAt: null } : null;
    },
    async listCalendarEvents() {
      const { data, error } = await rpcClient.rpc("private_calendar_events", { requested_digest: digest });
      if (error) throw new Error("Calendar lookup failed.");
      return ((data ?? []) as Array<{ event_id: string; title: string; starts_at: string; ends_at: string; location_name: string | null }>).map((event) => ({
        id: event.event_id,
        title: event.title,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        locationName: event.location_name,
      }));
    },
  };
}

export async function GET(_request: Request, context: CalendarRouteContext) {
  return defaultCalendarHandler(_request, context);
}

export function createCalendarRouteHandler(
  repositoryFactory: () => Promise<CalendarFeedRepository | null> | CalendarFeedRepository | null,
) {
  return async (_request: Request, context: CalendarRouteContext) => {
    const { token } = await context.params;
    try {
      const repository = await repositoryFactory();
      if (!repository) return notFoundResponse();
      return calendarResponse(await createCalendarFeed(repository, token));
    } catch {
      return notFoundResponse();
    }
  };
}

const defaultCalendarHandler = createCalendarRouteHandler(() =>
  environment.dataMode === "demo"
    ? new DemoRepository(createRiversideDemoSeed())
    : productionCalendarRepository(),
);
