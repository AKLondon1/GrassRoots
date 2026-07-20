import { describe, expect, it, vi } from "vitest";

import {
  acceptInvitation,
  hashInvitationToken,
  issueInvitation,
  type InvitationRpc,
} from "@/features/tenancy/invitations";

describe("tenancy invitations", () => {
  it("stores only a digest and returns the random raw token once", async () => {
    const rpc = vi.fn<InvitationRpc>().mockResolvedValue({
      data: "invite-id",
      error: null,
    });

    const result = await issueInvitation(
      {
        organisationId: "organisation-riverside",
        email: " Alex@Example.Test ",
        roleId: "role-coach",
        scope: {
          kind: "organisation",
          organisationId: "organisation-riverside",
        },
        expiresAt: "2030-08-01T12:00:00.000Z",
      },
      rpc,
    );

    expect(result.rawToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const args = rpc.mock.calls[0][1];
    expect(args.invite_token_digest).toBe(
      await hashInvitationToken(result.rawToken),
    );
    expect(JSON.stringify(args)).not.toContain(result.rawToken);
    expect(args.invite_email).toBe("alex@example.test");
  });

  it("hashes an acceptance token before calling the atomic RPC", async () => {
    const rpc = vi.fn<InvitationRpc>().mockResolvedValue({
      data: "membership-id",
      error: null,
    });

    await acceptInvitation("raw-secret-token", rpc);

    expect(rpc).toHaveBeenCalledWith("accept_organisation_invite", {
      invite_token_digest: await hashInvitationToken("raw-secret-token"),
    });
    expect(JSON.stringify(rpc.mock.calls[0][1])).not.toContain(
      "raw-secret-token",
    );
  });

  it("does not reveal whether a rejected token is live, expired, or replayed", async () => {
    const expiredRpc = vi.fn<InvitationRpc>().mockResolvedValue({
      data: null,
      error: { message: "Invitation expired or already used" },
    });
    const wrongAccountRpc = vi.fn<InvitationRpc>().mockResolvedValue({
      data: null,
      error: { message: "Invitation email does not match authenticated adult" },
    });

    const expired = await acceptInvitation("expired", expiredRpc);
    const wrongAccount = await acceptInvitation("wrong-account", wrongAccountRpc);

    expect(expired).toEqual({
      status: "error",
      message: "This invitation could not be accepted for this account.",
    });
    expect(wrongAccount).toEqual(expired);
  });
});
