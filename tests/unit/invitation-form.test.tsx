import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  acceptInvitationAction: vi.fn().mockResolvedValue({
    status: "accepted",
    message: "Your club invitation has been accepted.",
  }),
}));

vi.mock("@/app/(auth)/invite/[token]/actions", () => actions);

import { InvitationForm } from "@/components/auth/invitation-form";

describe("invitation form", () => {
  it("provides a clear route into the club after an invitation is accepted", async () => {
    const user = userEvent.setup();
    render(<InvitationForm token="safe-invitation-token" />);

    await user.click(
      screen.getByRole("button", { name: "Accept club invitation" }),
    );

    const continueLink = await screen.findByRole("link", {
      name: "Continue to club",
    });
    expect(continueLink).toHaveAttribute("href", "/app");
    expect(screen.getByRole("status")).toHaveTextContent(/accepted/i);
    await waitFor(() => expect(actions.acceptInvitationAction).toHaveBeenCalled());
  });
});
