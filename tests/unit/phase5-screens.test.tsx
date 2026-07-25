import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ParentAccountScreen } from "@/features/screens/parent/account";
import { ClubGovernanceScreen } from "@/features/screens/club/governance";
import { PlatformOperationsScreen } from "@/features/screens/platform/operations";

describe("phase 5 screens", () => {
  it("provides truthful parent payment, consent and messaging actions", () => {
    const { rerender } = render(<ParentAccountScreen section="payments" />);
    fireEvent.click(screen.getByRole("button", { name: /preview manual payment/i }));
    expect(screen.getByRole("status")).toHaveTextContent(/has not been charged/i);
    expect(screen.getByRole("link", { name: /download demo invoice/i })).toHaveAttribute("download");
    rerender(<ParentAccountScreen section="consents" />);
    expect(screen.getByRole("heading", { name: /photo and video consent/i })).toBeInTheDocument();
    rerender(<ParentAccountScreen section="messages" />);
    expect(screen.getByText(/adult group conversation/i)).toBeInTheDocument();
  });

  it("keeps safeguarding visibly restricted and compliance actionable", () => {
    const { rerender } = render(<ClubGovernanceScreen section="forms" role="club-admin" />);
    fireEvent.click(screen.getByRole("button", { name: /preview new version/i }));
    expect(screen.getByRole("status")).toHaveTextContent(/not published/i);
    rerender(<ClubGovernanceScreen section="safeguarding" role="club-admin" />);
    expect(screen.getByText(/welfare officers only/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /preview new concern/i }));
    expect(screen.getByRole("status")).toHaveTextContent(/no record was saved/i);
    rerender(<ClubGovernanceScreen section="compliance" role="welfare-officer" />);
    expect(screen.getByText(/expires in 11 days/i)).toBeInTheDocument();
  });

  it("separates platform plans, usage, support and audited access", () => {
    const { rerender } = render(<PlatformOperationsScreen section="plans" />);
    expect(screen.getByText(/platform subscription/i)).toBeInTheDocument();
    rerender(<PlatformOperationsScreen section="provider-usage" />);
    expect(screen.getByText(/provider metering/i)).toBeInTheDocument();
    rerender(<PlatformOperationsScreen section="audited-access" />);
    expect(screen.getByText(/time-limited/i)).toBeInTheDocument();
  });

  it("makes report export behaviour explicit in demo mode", () => {
    render(<ClubGovernanceScreen section="reports" role="club-admin" />);
    fireEvent.click(screen.getByRole("button", { name: /preview member export/i }));
    expect(screen.getByRole("status")).toHaveTextContent(/no file was generated/i);
  });
});
