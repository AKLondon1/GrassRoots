import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const registry = readFileSync(
  join(process.cwd(), "lib/navigation/screen-registry.ts"),
  "utf8",
);

const migrationsDirectory = join(process.cwd(), "supabase/migrations");
const migrations = readdirSync(migrationsDirectory)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => readFileSync(join(migrationsDirectory, name), "utf8"))
  .join("\n");

/** Every capability a screen is gated on, from `defineScreen(role, id, label, capability, kind)`. */
function screenCapabilities(): Map<string, string> {
  const pattern =
    /defineScreen\(\s*"([a-z]+)",\s*"([^"]+)",\s*"[^"]*",\s*"([^"]+)"/g;
  const found = new Map<string, string>();
  for (const match of registry.matchAll(pattern)) {
    const [, role, id, capability] = match;
    if (!found.has(capability)) found.set(capability, `${role}/${id}`);
  }
  return found;
}

/** Every permission key the migrations insert into the catalogue. */
function catalogueKeys(): Set<string> {
  const keys = new Set<string>();
  for (const match of migrations.matchAll(
    /insert into public\.permissions[\s\S]*?;/g,
  )) {
    for (const row of match[0].matchAll(
      /'([a-z][a-z0-9-]*:[a-z][a-z0-9-]*)'/g,
    )) {
      keys.add(row[1]);
    }
  }
  return keys;
}

describe("role model", () => {
  it("gates no screen on a capability the permission catalogue does not contain", () => {
    // Eight screens once failed this, including parent/home and coach/compose.
    // They were unreachable for every user because no role could grant a
    // permission that did not exist, and it took a signed-in browser pass to
    // notice. This assertion is the cheap version of that pass.
    const catalogue = catalogueKeys();
    const orphans = [...screenCapabilities().entries()]
      .filter(([capability]) => !catalogue.has(capability))
      .map(([capability, screen]) => `${capability} (${screen})`);

    expect(orphans).toEqual([]);
  });

  it("parses a plausible number of screens and permissions", () => {
    // Guards the regexes above: if `defineScreen` or the insert style changes,
    // the assertion above would silently pass by finding nothing at all.
    expect(screenCapabilities().size).toBeGreaterThan(20);
    expect(catalogueKeys().size).toBeGreaterThan(50);
  });

  it("defines the capabilities the weekly loop depends on", () => {
    const catalogue = catalogueKeys();
    for (const capability of [
      "family:view",
      "family:respond",
      "club:view",
      "announcements:manage",
      "fixtures:manage",
      "messages:view",
      "help:view",
      "pitches:book",
    ]) {
      expect(catalogue).toContain(capability);
    }
  });
});
