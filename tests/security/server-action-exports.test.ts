import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const actionFiles = [
  {
    label: "sign-in",
    segments: ["app", "(auth)", "sign-in", "actions.ts"],
  },
  {
    label: "invitation",
    segments: ["app", "(auth)", "invite", "[token]", "actions.ts"],
  },
  {
    label: "club registration",
    segments: ["app", "(marketing)", "register-club", "actions.ts"],
  },
] as const;

describe("Next.js server action exports", () => {
  it.each(actionFiles)(
    "$label actions do not export runtime state objects",
    ({ segments }) => {
      const source = readFileSync(join(process.cwd(), ...segments), "utf8");

      expect(source).not.toMatch(/export\s+const\s+initial[A-Z]\w*State\b/);
    },
  );
});
