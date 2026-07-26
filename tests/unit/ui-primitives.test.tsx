import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CircleAlert } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";
import { DeniedState } from "@/components/ui/denied-state";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Status } from "@/components/ui/status";

describe("Button", () => {
  it("supports a labelled loading state without accepting another click", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(
      <Button loading loadingLabel="Saving response" onClick={handleClick}>
        Save response
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Saving response" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("can style a real link as a secondary action", () => {
    render(
      <Button asChild variant="secondary">
        <a href="#weekly-view">See the weekly view</a>
      </Button>,
    );

    expect(
      screen.getByRole("link", { name: "See the weekly view" }),
    ).toHaveAttribute("href", "#weekly-view");
  });
});

describe("feedback primitives", () => {
  it("gives repeated state titles unique labelled-by relationships", () => {
    render(
      <>
        <EmptyState title="No fixtures yet" />
        <EmptyState title="No fixtures yet" />
      </>,
    );

    const regions = screen.getAllByRole("region", { name: "No fixtures yet" });
    const labelIds = regions.map((region) =>
      region.getAttribute("aria-labelledby"),
    );

    expect(new Set(labelIds).size).toBe(2);
    for (const labelId of labelIds) {
      expect(labelId).not.toBeNull();
      expect(document.getElementById(labelId!)).toHaveTextContent(
        "No fixtures yet",
      );
    }
  });

  it("pairs status colour with a visible label and icon", () => {
    render(
      <Status tone="warning" icon={CircleAlert}>
        Response needed
      </Status>,
    );

    const status = screen.getByText("Response needed");
    expect(status).toHaveAttribute("data-tone", "warning");
    expect(status.querySelector("svg")).toBeInTheDocument();
  });

  it("announces a skeleton without exposing decorative shapes", () => {
    render(<Skeleton aria-label="Loading the next event" />);

    expect(
      screen.getByRole("status", { name: "Loading the next event" }),
    ).toBeInTheDocument();
  });

  it.each([
    [
      <EmptyState key="empty" title="No events this week" />,
      "No events this week",
    ],
    [
      <ErrorState key="error" title="We could not load the schedule" />,
      "We could not load the schedule",
    ],
    [
      <DeniedState key="denied" title="You cannot view welfare notes" />,
      "You cannot view welfare notes",
    ],
  ])("renders a semantic state message for %s", (state, title) => {
    render(state);

    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
  });
});
