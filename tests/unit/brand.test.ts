import { describe, expect, it } from "vitest";

import { brand } from "@/lib/brand";

describe("brand", () => {
  it("uses the approved GrassRoots identity and UK defaults", () => {
    expect(brand.name).toBe("GrassRoots");
    expect(brand.locale).toBe("en-GB");
    expect(brand.timeZone).toBe("Europe/London");
    expect(brand.currency).toBe("GBP");
  });
});
