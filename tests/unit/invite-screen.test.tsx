import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InvitationScreen } from "@/components/auth/invitation-screen";

describe("invitation screen", () => {
  it("asks an unauthenticated adult to sign in without claiming delivery", () => {
    render(
      <InvitationScreen authenticated={false} mode="supabase" token="raw-token" />,
    );

    expect(screen.getByRole("heading", { name: "Club invitation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in to continue" })).toHaveAttribute(
      "href",
      "/sign-in?next=%2Finvite%2Fraw-token",
    );
    expect(screen.queryByText(/email sent/i)).not.toBeInTheDocument();
  });

  it("does not offer fake acceptance in demo mode", () => {
    render(<InvitationScreen authenticated={false} mode="demo" token="raw-token" />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      /invitations are unavailable in demo mode/i,
    );
    expect(screen.queryByRole("button", { name: /accept/i })).not.toBeInTheDocument();
  });

  it("offers atomic acceptance to an authenticated adult", () => {
    render(<InvitationScreen authenticated mode="supabase" token="raw-token" />);

    expect(
      screen.getByRole("button", { name: "Accept club invitation" }),
    ).toBeInTheDocument();
  });
});
