import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import RootLayout from "@/app/layout";
import { brand } from "@/lib/brand";
import * as brandConfig from "@/lib/brand";

describe("brand", () => {
  it("uses the approved GrassRoots identity and UK defaults", () => {
    expect(brand.name).toBe("GrassRoots");
    expect(brand.locale).toBe("en-GB");
    expect(brand.timeZone).toBe("Europe/London");
    expect(brand.currency).toBe("GBP");
  });

  it("derives injected CSS variables from a replaceable explicit palette", () => {
    const paletteApi = brandConfig as unknown as {
      createBrandCssVariables?: (palette: Record<string, string>) => Record<string, string>;
    };
    const palette = {
      ...(brand.identity as unknown as { palette?: Record<string, string> }).palette,
      primary: "oklch(0.6 0.18 280)",
      accent: "oklch(0.72 0.16 320)",
    };

    expect((brand.identity as unknown as { seedHue?: number }).seedHue).toBeUndefined();
    expect(Object.keys(palette).length).toBeGreaterThan(10);
    expect(paletteApi.createBrandCssVariables).toBeTypeOf("function");
    expect(paletteApi.createBrandCssVariables!(palette)).toMatchObject({
      "--brand-primary": "oklch(0.6 0.18 280)",
      "--brand-accent": "oklch(0.72 0.16 320)",
    });
  });

  it("injects the configured palette and aliases product tokens to it", () => {
    const layout = RootLayout({ children: null });
    const globals = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

    expect(layout.props.style).toMatchObject({
      "--brand-primary": "oklch(0.56 0.12 188)",
      "--brand-accent": "oklch(0.72 0.14 72)",
    });
    expect(globals).toContain("--primary: var(--brand-primary);");
    expect(globals).toContain("--accent: var(--brand-accent);");
    expect(globals).not.toMatch(/--primary:\s*oklch/);
  });
});
