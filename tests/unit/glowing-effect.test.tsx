import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GlowingEffect } from "@/components/ui/glowing-effect";

function setMediaPreferences({ reduced = false, coarse = false } = {}) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("reduced-motion") ? reduced : coarse,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe("GlowingEffect", () => {
  it("renders a directional gradient mask using the public spread value", () => {
    setMediaPreferences();
    const { container } = render(
      <div className="relative">
        <GlowingEffect disabled={false} spread={32} />
      </div>,
    );

    const effect = container.querySelector<HTMLElement>(".glowing-effect");
    const directionalLayer = container.querySelector<HTMLElement>(
      "[data-glow-direction]",
    );

    expect(effect?.style.getPropertyValue("--spread")).toBe("32");
    expect(effect?.style.getPropertyValue("--gradient")).toContain(
      "repeating-conic-gradient",
    );
    expect(directionalLayer?.className).toContain("--start");
    expect(directionalLayer?.className).toContain("--spread");
  });

  it("follows pointer direction immediately when reduced motion is requested", async () => {
    setMediaPreferences({ reduced: true });
    const { container } = render(
      <div className="relative">
        <GlowingEffect disabled={false} proximity={56} />
      </div>,
    );
    const effect = container.querySelector<HTMLElement>(".glowing-effect");
    expect(effect).not.toBeNull();
    vi.spyOn(effect!, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });

    fireEvent.pointerMove(document.body, { clientX: 150, clientY: 50 });

    await waitFor(() => {
      expect(effect?.style.getPropertyValue("--active")).toBe("1");
      expect(Number(effect?.style.getPropertyValue("--start"))).toBeCloseTo(90);
    });
  });
});
