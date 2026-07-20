import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";
import { brand } from "@/lib/brand";

describe("marketing landing page", () => {
  it("uses the central brand and leads with one calm next step", () => {
    render(<Home />);

    expect(screen.getAllByText(brand.name).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /the week in football, sorted/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /see the weekly view/i }),
    ).toHaveAttribute("href", "#weekly-view");
  });

  it("provides semantic product, story and footer landmarks", () => {
    render(<Home />);

    const navigation = screen.getByRole("navigation", {
      name: "Primary navigation",
    });
    expect(
      within(navigation).getByRole("link", { name: "Product" }),
    ).toHaveAttribute("href", "#weekly-view");

    expect(
      screen.getByRole("region", { name: /your week at a glance/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /change it once/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toHaveTextContent(brand.tagline);
  });

  it("describes the product preview honestly", () => {
    render(<Home />);

    expect(screen.getAllByText(/illustrative product preview/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/integration complete/i)).not.toBeInTheDocument();
  });
});
