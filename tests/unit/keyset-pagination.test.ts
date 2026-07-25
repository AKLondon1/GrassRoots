import { describe, expect, it } from "vitest";

import { keysetPage, parseUuidCursor } from "@/lib/pagination/keyset";

describe("keyset pagination", () => {
  it("accepts only opaque UUID cursors", () => {
    expect(parseUuidCursor("00000000-0000-4000-8000-000000000101")).toBe("00000000-0000-4000-8000-000000000101");
    expect(parseUuidCursor("' or true --")).toBeUndefined();
  });

  it("returns a continuation cursor without dropping the boundary row", () => {
    const page = keysetPage([{ id: "a" }, { id: "b" }, { id: "c" }], 2);
    expect(page).toEqual({ items: [{ id: "a" }, { id: "b" }], nextCursor: "b" });
  });
});
