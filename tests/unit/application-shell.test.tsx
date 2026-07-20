import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationShell } from "@/components/shell/application-shell";

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

describe("illustrative application shell", () => {
  beforeEach(() => router.push.mockReset());

  it("opens in an explicit non-persistent parent demo", () => {
    render(
      <ApplicationShell
        activeSection="home"
        role="parent"
        workspace="riverside-juniors"
      />,
    );

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
        within(mobileNavigation).getByRole("link", { name: destination }),
      ).toBeInTheDocument();
    }
    expect(
      within(mobileNavigation).getByRole("link", { name: "Schedule" }),
    ).toHaveAttribute(
      "href",
      "/app/riverside-juniors/schedule?role=parent",
    );
  });

  it("renders route-selected role-aware content", () => {
    render(
      <ApplicationShell
        activeSection="today"
        role="coach"
        workspace="riverside-juniors"
      />,
    );

    expect(
      screen.getByRole("navigation", { name: "Coach navigation" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Today with Under 11s" }),
    ).toBeInTheDocument();
  });

  it("switches roles by navigating to that role's valid default screen", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationShell
        activeSection="home"
        role="parent"
        workspace="riverside-juniors"
      />,
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Preview role" }),
      "coach",
    );

    expect(router.push).toHaveBeenCalledWith(
      "/app/riverside-juniors/today?role=coach",
    );
  });

  it("finds registered screens through the command menu", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationShell
        activeSection="home"
        role="parent"
        workspace="riverside-juniors"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Search screens" }));
    const dialog = screen.getByRole("dialog", { name: "Find a screen" });
    await user.type(within(dialog).getByRole("searchbox"), "payment");

    expect(
      within(dialog).getByRole("link", { name: "Payments" }),
    ).toHaveAttribute(
      "href",
      "/app/riverside-juniors/payments?role=parent",
    );
  });
});
