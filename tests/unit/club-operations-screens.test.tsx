import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ClubOperationsScreen } from "@/features/screens/club/operations";

describe("club operations screens", () => {
  it("offers a keyboard-first pitch allocation alternative", () => {
    render(<ClubOperationsScreen section="pitch-planner" />);
    expect(screen.getByRole("heading", { level: 2, name: "Saturday pitch plan" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Move Under 11s fixture"), { target: { value: "pitch-2-1100" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview relocation" }));
    expect(screen.getByRole("status")).toHaveTextContent(/not saved/i);
  });

  it("exposes inspection and maintenance state without pretending to save", () => {
    render(<ClubOperationsScreen section="inspections" />);
    fireEvent.click(screen.getByRole("button", { name: "Preview pitch closure" }));
    expect(screen.getByRole("status")).toHaveTextContent(/No booking was changed/i);
  });

  it("labels the weather source as a development adapter", () => {
    render(<ClubOperationsScreen section="venues" />);
    expect(screen.getByText(/development weather fixture/i)).toBeInTheDocument();
    expect(screen.getByText(/not a live forecast/i)).toBeInTheDocument();
  });

  it("shows versioned documents, equipment and support audit boundaries", () => {
    const { rerender } = render(<ClubOperationsScreen section="documents" />);
    expect(screen.getByText("Pitch allocation policy")).toBeInTheDocument();
    expect(screen.getByText(/Version 3/)).toBeInTheDocument();
    rerender(<ClubOperationsScreen section="equipment" />);
    expect(screen.getByText("Under 11 match kit")).toBeInTheDocument();
    rerender(<ClubOperationsScreen section="support" />);
    expect(screen.getByText(/time-limited and audited/i)).toBeInTheDocument();
  });
});
