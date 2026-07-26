import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  signOutCurrentSession: vi.fn(),
}));

vi.mock("@/app/(auth)/sign-out/actions", () => actions);

import { SignOutForm } from "@/components/auth/sign-out-form";

describe("sign out form", () => {
  it("communicates pending state while ending the current session", async () => {
    let resolveSignOut: (() => void) | undefined;
    actions.signOutCurrentSession.mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveSignOut = resolve; }),
    );
    const user = userEvent.setup();
    render(<SignOutForm />);

    const submit = user.click(
      screen.getByRole("button", { name: "Sign out and switch account" }),
    );

    await waitFor(() => expect(actions.signOutCurrentSession).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Signing out" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Signing out" })).toHaveAttribute(
      "aria-busy",
      "true",
    );

    resolveSignOut?.();
    await submit;
  });
});
