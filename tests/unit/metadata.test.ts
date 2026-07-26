import { describe, expect, it } from "vitest";

import { createSiteMetadata } from "@/lib/metadata";

describe("createSiteMetadata", () => {
  it("derives metadata from a replaceable brand configuration", () => {
    const metadata = createSiteMetadata({
      name: "Community FC",
      description: "A club platform",
    });

    expect(metadata.title).toBe("Community FC");
    expect(metadata.description).toBe("A club platform");
    expect(metadata.applicationName).toBe("Community FC");
  });
});
