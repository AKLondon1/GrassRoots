import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { RoleSwitcher } from "@/components/shell/role-switcher";

describe("role switcher", () => {
  it("offers only the roles the member actually holds", () => {
    render(
      <RoleSwitcher
        value="club"
        workspace="riverside"
        roles={["club", "parent"]}
      />,
    );

    expect(
      screen.getByRole("option", { name: "Club administration" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Parent" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Coach" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Platform operations" }),
    ).not.toBeInTheDocument();
  });

  it("describes the control as a real permission change, not a preview", () => {
    render(
      <RoleSwitcher
        value="club"
        workspace="riverside"
        roles={["club", "parent"]}
      />,
    );

    expect(screen.getByLabelText("Acting as")).toBeInTheDocument();
  });
});
