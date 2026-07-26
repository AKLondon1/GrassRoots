import { createHash, randomBytes } from "node:crypto";

import type { PermissionScope } from "@/features/tenancy/types";

type RpcResult = Promise<{
  data: string | null;
  error: { message: string } | null;
}>;

export type InvitationRpc = (
  functionName: string,
  args: Record<string, unknown>,
) => RpcResult;

interface IssueInvitationInput {
  organisationId: string;
  email: string;
  roleId: string;
  scope: PermissionScope;
  expiresAt: string;
}

function scopeId(scope: PermissionScope): string {
  if (scope.kind === "organisation") return scope.organisationId;
  if (scope.kind === "team") return scope.teamId;
  return scope.resourceId;
}

export async function hashInvitationToken(rawToken: string): Promise<string> {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export async function issueInvitation(
  input: IssueInvitationInput,
  rpc: InvitationRpc,
): Promise<{ invitationId: string; rawToken: string }> {
  const rawToken = randomBytes(32).toString("base64url");
  const digest = await hashInvitationToken(rawToken);
  const { data, error } = await rpc("issue_organisation_invite", {
    requested_organisation_id: input.organisationId,
    invite_email: input.email.trim().toLowerCase(),
    invite_role_id: input.roleId,
    invite_scope_kind: input.scope.kind,
    invite_scope_id: scopeId(input.scope),
    invite_resource_type:
      input.scope.kind === "resource" ? input.scope.resourceType : null,
    invite_token_digest: digest,
    invite_expires_at: input.expiresAt,
  });

  if (error || !data) {
    throw new Error("Could not create the invitation.");
  }

  return { invitationId: data, rawToken };
}

export type InvitationAcceptanceState =
  | { status: "accepted"; membershipId: string; message: string }
  | { status: "error"; message: string };

export async function acceptInvitation(
  rawToken: string,
  rpc: InvitationRpc,
): Promise<InvitationAcceptanceState> {
  const digest = await hashInvitationToken(rawToken);
  const { data, error } = await rpc("accept_organisation_invite", {
    invite_token_digest: digest,
  });

  if (error) {
    return {
      status: "error",
      message: "This invitation could not be accepted for this account.",
    };
  }

  if (!data) {
    return {
      status: "error",
      message: "This invitation could not be accepted for this account.",
    };
  }

  return {
    status: "accepted",
    membershipId: data,
    message: "Invitation accepted. Your club access is now active.",
  };
}
