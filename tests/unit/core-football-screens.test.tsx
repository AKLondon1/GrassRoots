import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { CoachCoreFootballScreen } from "@/features/screens/coach/core-football";
import { ParentCoreFootballScreen } from "@/features/screens/parent/core-football";

describe("parent core football screens", () => {
  it("submits an explicit non-persistent availability preview", async () => {
    const user = userEvent.setup();
    render(<ParentCoreFootballScreen section="availability" />);

    await user.click(screen.getByRole("radio", { name: "Unavailable" }));
    await user.click(screen.getByRole("button", { name: "Preview response" }));

    expect(screen.getByRole("status")).toHaveTextContent(/demo only/i);
    expect(screen.getByRole("status")).toHaveTextContent(/not saved/i);
  });

  it.each(["actions", "schedule", "event", "polls", "squad", "announcements"])(
    "renders task-specific content for %s",
    (section) => {
      render(<ParentCoreFootballScreen section={section} />);
      expect(screen.getByTestId(`parent-${section}`)).toBeInTheDocument();
    },
  );
});

describe("coach core football screens", () => {
  it("validates the event editor and confirms demo-only preview", async () => {
    const user = userEvent.setup();
    render(<CoachCoreFootballScreen section="event-editor" />);
    const title = screen.getByRole("textbox", { name: "Event title" });

    await user.clear(title);
    await user.click(screen.getByRole("button", { name: "Preview event changes" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/enter an event title/i);

    await user.type(title, "Thursday training");
    await user.click(screen.getByRole("button", { name: "Preview event changes" }));
    expect(screen.getByRole("status")).toHaveTextContent(/not saved/i);
  });

  it.each(["today", "calendar", "availability", "squad"])(
    "renders task-specific content for %s",
    (section) => {
      render(<CoachCoreFootballScreen section={section} />);
      expect(screen.getByTestId(`coach-${section}`)).toBeInTheDocument();
    },
  );

  it.each(["team", "match-day", "formation", "playing-time", "attendance", "training", "drills", "players", "development", "compose", "volunteers"])(
    "renders a functional coaching workspace for %s",
    (section) => {
      render(<CoachCoreFootballScreen section={section} />);
      expect(screen.getByTestId(`coach-${section}`)).toBeInTheDocument();
    },
  );
});

it("shows parents only an approved positive development summary", () => {
  render(<ParentCoreFootballScreen section="child" />);
  expect(screen.getByTestId("parent-child")).toHaveTextContent(/approved development update/i);
  expect(screen.queryByText(/private observation/i)).not.toBeInTheDocument();
});
