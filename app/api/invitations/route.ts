import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";

import { issueInvitation } from "@/features/tenancy/invitations";
import { createSupabaseTenancyAccessReader, resolveProductionWorkspaceAccess } from "@/features/tenancy/service";
import { environment } from "@/lib/env";
import { assertSameOriginMutation } from "@/lib/security/request";
import { consumeDistributedRateLimit } from "@/lib/security/server-rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const schema = z.object({ workspace: z.string().min(1).max(120), email: z.email(), roleId: z.uuid() });

export async function POST(request: Request) {
  try { assertSameOriginMutation(request); } catch { return NextResponse.json({ error: "Request origin rejected." }, { status: 403 }); }
  const client = await createServerSupabaseClient();
  if (!client) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  let input: z.infer<typeof schema>;
  try { input = schema.parse(await request.json()); } catch { return NextResponse.json({ error: "A valid email address and role are required." }, { status: 400 }); }
  const access = await resolveProductionWorkspaceAccess(createSupabaseTenancyAccessReader(client), input.workspace, auth.user.id);
  if (access.status === "denied" || !access.capabilities.includes("invitations:manage")) return NextResponse.json({ error: "Invitation management access denied." }, { status: 403 });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Invitation protection is unavailable." }, { status: 503 });
  try {
    const limit = await consumeDistributedRateLimit(admin as unknown as SupabaseClient, `invitation:${access.membershipId}`, { limit: 20, windowSeconds: 900 });
    if (!limit.allowed) return NextResponse.json({ error: "Too many invitations were requested. Try again later." }, { status: 429 });
  } catch { return NextResponse.json({ error: "Request protection is temporarily unavailable." }, { status: 503 }); }
  try {
    const issued = await issueInvitation({ organisationId: access.organisationId, email: input.email, roleId: input.roleId, scope: { kind: "organisation", organisationId: access.organisationId }, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString() }, client.rpc.bind(client) as never);
    const origin = environment.server.APP_ORIGIN ?? new URL(request.url).origin;
    return NextResponse.json({ link: new URL(`/invite/${issued.rawToken}`, origin).toString(), expiresInDays: 7 }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "The invitation could not be issued for that role." }, { status: 422 }); }
}
