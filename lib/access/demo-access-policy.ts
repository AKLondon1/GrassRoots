import type { AppRole } from "@/lib/navigation/screen-registry";

export type DemoCapability = `${string}:${string}`;

const demoCapabilitiesByRole = {
  parent: [
    "family:view",
    "family:respond",
    "events:view",
    "availability:respond",
    "polls:respond",
    "squads:view",
    "messages:view",
    "announcements:view",
    "payments:view",
    "consents:respond",
    "household:manage",
    "notifications:manage",
    "calendar:manage",
    "help:view",
  ],
  coach: [
    "team:view",
    "events:view",
    "events:manage",
    "availability:manage",
    "squads:manage",
    "matches:manage",
    "attendance:manage",
    "training:manage",
    "players:view",
    "development:manage",
    "announcements:manage",
    "volunteers:view",
  ],
  club: [
    "club:view",
    "events:view",
    "teams:manage",
    "seasons:manage",
    "people:manage",
    // Deliberately NOT roles:manage. The access screen reads live memberships and
    // scoped_role_assignments, which the demo has no database for, so offering the
    // link here would lead to a crash rather than a demonstration.
    "invitations:manage",
    "venues:manage",
    "pitches:manage",
    "pitches:inspect",
    "facilities:manage",
    "fixtures:manage",
    "opposition:manage",
    "payments:manage",
    "forms:manage",
    "consents:manage",
    "documents:manage",
    "equipment:manage",
    "compliance:manage",
    "reports:view",
    "audit:view",
    "support:request",
    "volunteers:manage",
    "club:manage",
    "integrations:manage",
    "entitlements:view",
  ],
  platform: [
    "platform:view",
    "plans:manage",
    "features:manage",
    "providers:view",
    "health:view",
    "support:manage",
    "analytics:view",
  ],
} as const satisfies Record<AppRole, readonly DemoCapability[]>;

export function getDemoCapabilities(
  role: AppRole,
): readonly DemoCapability[] {
  return demoCapabilitiesByRole[role];
}
