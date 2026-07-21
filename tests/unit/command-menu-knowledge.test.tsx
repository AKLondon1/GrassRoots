import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CommandMenu } from "@/components/shell/command-menu";
import { findScreen } from "@/lib/navigation/screen-registry";

describe("command menu knowledge search", () => {
  it("does not reveal a record when its destination capability is absent", () => {
    const overview = findScreen("club", "overview");
    if (!overview) throw new Error("Overview screen missing from registry");
    render(<CommandMenu isDemo role="club" screens={[overview]} workspace="riverside-juniors" />);
    fireEvent.click(screen.getByRole("button", { name: "Search screens" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search registered screens" }), { target: { value: "pitch allocation" } });
    expect(screen.queryByText("Pitch allocation policy")).not.toBeInTheDocument();
    expect(screen.getByText("No screen matches that search.")).toBeInTheDocument();
  });
});
