"use server";

import {
  acceptInvitation,
  type InvitationAcceptanceState,
} from "@/features/tenancy/invitations";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function acceptInvitationAction(
  _previousState: InvitationAcceptanceState,
  formData: FormData,
): Promise<InvitationAcceptanceState> {
  const token = formData.get("token");
  if (typeof token !== "string" || token.length < 1) {
    return { status: "error", message: "This invitation link is invalid." };
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return {
      status: "error",
      message: "Invitations are unavailable in demo mode.",
    };
  }

  return acceptInvitation(token, async (_functionName, args) => {
    const digest = String(args.invite_token_digest ?? "");
    const { data, error } = await (
      supabase as unknown as SupabaseClient
    ).rpc("accept_organisation_invite", { invite_token_digest: digest });
    return { data, error };
  });
}
