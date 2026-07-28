import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationShell } from "@/components/shell/application-shell";
import { appRoles } from "@/lib/navigation/screen-registry";

const router = vi.hoisted(() => ({ push: vi.fn() }));

const parentCapabilities = [
  "family:view",
  "events:view",
  "messages:view",
  "payments:view",
  "household:manage",
] as const;

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

describe("illustrative application shell", () => {
  beforeEach(() => router.push.mockReset());

  it("opens in an explicit non-persistent parent demo", () => {
    render(
      <ApplicationShell
        activeSection="home"
        capabilities={parentCapabilities}
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
        capabilities={["team:view"]}
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

  it("does not label an authorised Supabase workspace as a demo", () => {
    render(
      <ApplicationShell
        activeSection="today"
        capabilities={["team:view"]}
        isDemo={false}
        role="coach"
        workspace="riverside-juniors"
      />,
    );

    expect(screen.queryByText(/illustrative demo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/changes are not saved/i)).not.toBeInTheDocument();
    expect(screen.getByText("Organisation access")).toBeInTheDocument();
  });

  it("switches roles by navigating to that role's valid default screen", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationShell
        activeSection="home"
        capabilities={parentCapabilities}
        role="parent"
        roles={appRoles}
        workspace="riverside-juniors"
      />,
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Acting as" }),
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
        capabilities={parentCapabilities}
        role="parent"
        workspace="riverside-juniors"
      />,
    );

    const trigger = screen.getByRole("button", { name: "Search screens" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Find a screen" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", dialog.id);
    await user.type(within(dialog).getByRole("searchbox"), "payment");

    expect(
      within(dialog).getByRole("link", { name: "Payments" }),
    ).toHaveAttribute(
      "href",
      "/app/riverside-juniors/payments?role=parent",
    );
  });

  it("keeps Tab focus inside the open command menu", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationShell
        activeSection="home"
        capabilities={parentCapabilities}
        role="parent"
        workspace="riverside-juniors"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Search screens" }));
    const dialog = screen.getByRole("dialog", { name: "Find a screen" });
    const closeButton = within(dialog).getByRole("button", {
      name: "Close screen search",
    });
    const links = within(dialog).getAllByRole("link");
    const lastLink = links.at(-1)!;

    lastLink.focus();
    await user.tab();
    expect(closeButton).toHaveFocus();

    closeButton.focus();
    await user.tab({ shift: true });
    expect(lastLink).toHaveFocus();
  });

  it("returns focus to the command trigger after Escape and close", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationShell
        activeSection="home"
        capabilities={parentCapabilities}
        role="parent"
        workspace="riverside-juniors"
      />,
    );

    const trigger = screen.getByRole("button", { name: "Search screens" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Find a screen" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(
      screen.getByRole("button", { name: "Close screen search" }),
    );
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("removes denied same-role screens from navigation and search", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationShell
        activeSection="overview"
        capabilities={["club:view", "events:view"]}
        role="club"
        workspace="riverside-juniors"
      />,
    );

    const navigation = screen.getByRole("navigation", {
      name: "Club administration navigation",
    });
    expect(
      within(navigation).queryByRole("link", { name: "Safeguarding" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Search screens" }));
    const dialog = screen.getByRole("dialog", { name: "Find a screen" });
    await user.type(within(dialog).getByRole("searchbox"), "safeguarding");
    expect(
      within(dialog).queryByRole("link", { name: "Safeguarding" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByText("No screen matches that search."),
    ).toBeInTheDocument();
  });

  it("never renders demo copy when not in demo mode", () => {
    render(
      <ApplicationShell
        activeSection="overview"
        capabilities={["club:view"]}
        isDemo={false}
        role="club"
        roles={["club"]}
        workspace="riverside-juniors"
      />,
    );

    expect(screen.queryByText(/Jamie/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Jayden/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Northfield Juniors/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Riverside, Pitch 2/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Confirm Saturday pitch allocation/)).not.toBeInTheDocument();
  });

  it("still renders the demo focus panels in demo mode", () => {
    render(
      <ApplicationShell
        activeSection="overview"
        capabilities={["club:view"]}
        role="club"
        roles={appRoles}
        workspace="riverside-juniors"
      />,
    );

    expect(
      screen.getByText("Confirm Saturday pitch allocation"),
    ).toBeInTheDocument();
  });

  it("renders a recoverable state when the role has no permitted screens", () => {
    render(
      <ApplicationShell
        activeSection="overview"
        capabilities={[]}
        isDemo={false}
        role="club"
        roles={["club"]}
        workspace="riverside-juniors"
      />,
    );

    expect(
      screen.getByRole("heading", { name: /No screens are available/i }),
    ).toBeInTheDocument();
  });
});
