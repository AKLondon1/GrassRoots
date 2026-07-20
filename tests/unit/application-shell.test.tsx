import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ApplicationShell } from "@/components/shell/application-shell";

describe("illustrative application shell", () => {
  it("opens in an explicit non-persistent parent demo", () => {
    render(<ApplicationShell workspace="riverside-juniors" />);

    expect(screen.getByText(/illustrative demo/i)).toBeInTheDocument();
    expect(screen.getByText(/changes are not saved/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Your football week" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Parent navigation" }),
    ).toBeInTheDocument();
    const mobileNavigation = screen.getByRole("navigation", {
      name: "Parent mobile navigation",
    });
    for (const destination of ["Home", "Schedule", "Messages", "Payments", "Family"]) {
      expect(
        within(mobileNavigation).getByRole("button", { name: destination }),
      ).toBeInTheDocument();
    }
  });

  it("switches role-aware navigation and useful demo content in memory", async () => {
    const user = userEvent.setup();
    render(<ApplicationShell workspace="riverside-juniors" />);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Preview role" }),
      "coach",
    );

    expect(
      screen.getByRole("navigation", { name: "Coach navigation" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Today with Under 11s" }),
    ).toBeInTheDocument();
  });

  it("finds registered screens through the command menu", async () => {
    const user = userEvent.setup();
    render(<ApplicationShell workspace="riverside-juniors" />);

    await user.click(screen.getByRole("button", { name: "Search screens" }));
    const dialog = screen.getByRole("dialog", { name: "Find a screen" });
    await user.type(within(dialog).getByRole("searchbox"), "payment");

    expect(
      within(dialog).getByRole("button", { name: "Payments" }),
    ).toBeInTheDocument();
  });
});
