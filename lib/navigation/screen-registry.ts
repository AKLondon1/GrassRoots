export const appRoles = ["parent", "coach", "club", "platform"] as const;

export type AppRole = (typeof appRoles)[number];

export type ScreenComponentKind =
  | "agenda"
  | "board"
  | "calendar"
  | "detail"
  | "directory"
  | "form"
  | "list"
  | "planner"
  | "report"
  | "settings";

export interface ScreenStateCopy {
  loading: string;
  empty: {
    title: string;
    description: string;
  };
  error: string;
  denied: string;
}

export interface ScreenDefinition {
  id: string;
  label: string;
  role: AppRole;
  section: string;
  path: `/app/[workspace]/${string}`;
  capability: `${string}:${string}`;
  componentKind: ScreenComponentKind;
  states: ScreenStateCopy;
}

export const roleLabels: Record<AppRole, string> = {
  parent: "Parent",
  coach: "Coach",
  club: "Club administration",
  platform: "Platform operations",
};

function defineScreen(
  role: AppRole,
  id: string,
  label: string,
  capability: `${string}:${string}`,
  componentKind: ScreenComponentKind,
  denied?: string,
): ScreenDefinition {
  const subject = label.toLowerCase();

  return {
    id,
    label,
    role,
    section: id,
    path: `/app/[workspace]/${id}`,
    capability,
    componentKind,
    states: {
      loading: `Loading ${subject}…`,
      empty: {
        title: `No ${subject} yet`,
        description: `When ${subject} are available, they will appear here with the next useful action.`,
      },
      error: `We could not load ${subject}. Try again in a moment.`,
      denied:
        denied ??
        `Your current club role does not include permission to view ${subject}.`,
    },
  };
}

const parentScreens = [
  defineScreen("parent", "home", "Home", "family:view", "agenda"),
  defineScreen("parent", "actions", "Actions", "family:respond", "list"),
  defineScreen("parent", "schedule", "Schedule", "events:view", "calendar"),
  defineScreen("parent", "event", "Event details", "events:view", "detail"),
  defineScreen("parent", "availability", "Availability", "availability:respond", "form"),
  defineScreen("parent", "polls", "Time polls", "polls:respond", "form"),
  defineScreen("parent", "squad", "Squad status", "squads:view", "detail"),
  defineScreen("parent", "messages", "Messages", "messages:view", "list"),
  defineScreen("parent", "announcements", "Announcements", "announcements:view", "list"),
  defineScreen("parent", "payments", "Payments", "payments:view", "list"),
  defineScreen("parent", "consents", "Consents", "consents:respond", "form"),
  defineScreen("parent", "child", "Child profile", "family:view", "detail"),
  defineScreen("parent", "household", "Household", "household:manage", "settings"),
  defineScreen("parent", "notifications", "Notifications", "notifications:manage", "settings"),
  defineScreen("parent", "calendar", "Calendar links", "calendar:manage", "settings"),
  defineScreen("parent", "help", "Help", "help:view", "directory"),
] as const;

const coachScreens = [
  defineScreen("coach", "today", "Today", "team:view", "board"),
  defineScreen("coach", "team", "Team", "team:view", "directory"),
  defineScreen("coach", "calendar", "Calendar", "events:view", "calendar"),
  defineScreen("coach", "event-editor", "Event editor", "events:manage", "form"),
  defineScreen("coach", "availability", "Availability", "availability:manage", "board"),
  defineScreen("coach", "squad", "Squad selection", "squads:manage", "planner"),
  defineScreen("coach", "match-day", "Match day", "matches:manage", "board"),
  defineScreen("coach", "formation", "Formation", "matches:manage", "planner"),
  defineScreen("coach", "playing-time", "Playing time", "matches:manage", "report"),
  defineScreen("coach", "attendance", "Attendance", "attendance:manage", "list"),
  defineScreen("coach", "training", "Training", "training:manage", "planner"),
  defineScreen("coach", "drills", "Drill library", "training:manage", "directory"),
  defineScreen("coach", "players", "Players", "players:view", "directory"),
  defineScreen("coach", "development", "Development", "development:manage", "report"),
  defineScreen("coach", "compose", "Compose update", "announcements:manage", "form"),
  defineScreen("coach", "volunteers", "Volunteers", "volunteers:view", "list"),
] as const;

const clubScreens = [
  defineScreen("club", "overview", "Overview", "club:view", "board"),
  defineScreen("club", "calendar", "Club calendar", "events:view", "calendar"),
  defineScreen("club", "teams", "Teams", "teams:manage", "directory"),
  defineScreen("club", "seasons", "Seasons", "seasons:manage", "settings"),
  defineScreen("club", "people", "People", "people:manage", "directory"),
  defineScreen("club", "invitations", "Invitations", "invitations:manage", "list"),
  defineScreen("club", "venues", "Venues", "venues:manage", "directory"),
  defineScreen("club", "pitch-planner", "Pitch planner", "pitches:manage", "planner"),
  defineScreen("club", "inspections", "Inspections", "pitches:inspect", "list"),
  defineScreen("club", "maintenance", "Maintenance", "facilities:manage", "planner"),
  defineScreen("club", "fixtures", "Fixtures", "fixtures:manage", "list"),
  defineScreen("club", "opposition", "Opposition", "opposition:manage", "directory"),
  defineScreen("club", "payments", "Payments", "payments:manage", "report"),
  defineScreen("club", "communications", "Communications", "messages:manage", "list"),
  defineScreen("club", "forms", "Forms", "forms:manage", "form"),
  defineScreen("club", "consents", "Consents", "consents:manage", "report"),
  defineScreen("club", "documents", "Documents", "documents:manage", "directory"),
  defineScreen("club", "equipment", "Equipment", "equipment:manage", "list"),
  defineScreen("club", "volunteers", "Volunteer rota", "volunteers:manage", "list"),
  defineScreen("club", "compliance", "Compliance", "compliance:manage", "board"),
  defineScreen(
    "club",
    "safeguarding",
    "Safeguarding",
    "safeguarding:view",
    "board",
    "Safeguarding detail hidden. Your current club role does not include permission to view restricted case information.",
  ),
  defineScreen("club", "reports", "Reports", "reports:view", "report"),
  defineScreen("club", "audit", "Audit log", "audit:view", "report"),
  defineScreen("club", "support", "Support", "support:request", "form"),
  defineScreen("club", "settings", "Club settings", "club:manage", "settings"),
  defineScreen("club", "integrations", "Integrations", "integrations:manage", "settings"),
  defineScreen("club", "entitlements", "Entitlements", "entitlements:view", "settings"),
] as const;

const platformScreens = [
  defineScreen("platform", "organisations", "Organisations", "platform:view", "directory"),
  defineScreen("platform", "plans", "Plans", "plans:manage", "settings"),
  defineScreen("platform", "feature-flags", "Feature flags", "features:manage", "settings"),
  defineScreen("platform", "provider-usage", "Provider usage", "providers:view", "report"),
  defineScreen("platform", "health", "System health", "health:view", "board"),
  defineScreen("platform", "support", "Support cases", "support:manage", "list"),
  defineScreen("platform", "audited-access", "Audited access", "access:manage", "report"),
  defineScreen("platform", "analytics", "Analytics", "analytics:view", "report"),
] as const;

export const screenRegistry: readonly ScreenDefinition[] = [
  ...parentScreens,
  ...coachScreens,
  ...clubScreens,
  ...platformScreens,
];

export function getScreensForRole(role: AppRole): readonly ScreenDefinition[] {
  return screenRegistry.filter((screen) => screen.role === role);
}

export function findScreen(
  role: AppRole,
  screenId: string,
): ScreenDefinition | undefined {
  return screenRegistry.find(
    (screen) => screen.role === role && screen.id === screenId,
  );
}

export type ScreenResolution =
  | { status: "allowed"; screen: ScreenDefinition }
  | { status: "denied"; screen: ScreenDefinition }
  | { status: "unknown" };

interface ResolveScreenSectionInput {
  capabilities: readonly string[];
  role: AppRole;
  section: string;
}

export function resolveScreenSection({
  capabilities,
  role,
  section,
}: ResolveScreenSectionInput): ScreenResolution {
  const matchingScreens = screenRegistry.filter(
    (screen) => screen.section === section,
  );

  if (matchingScreens.length === 0) return { status: "unknown" };

  const roleScreen = matchingScreens.find((screen) => screen.role === role);
  if (!roleScreen) {
    return { status: "denied", screen: matchingScreens[0] };
  }

  if (!capabilities.includes(roleScreen.capability)) {
    return { status: "denied", screen: roleScreen };
  }

  return { status: "allowed", screen: roleScreen };
}

export function getDefaultScreen(role: AppRole): ScreenDefinition {
  const screen = getScreensForRole(role)[0];
  if (!screen) throw new Error(`No default screen is registered for ${role}.`);
  return screen;
}

export function getAllowedScreensForRole(
  role: AppRole,
  capabilities: readonly string[],
): readonly ScreenDefinition[] {
  return getScreensForRole(role).filter((screen) =>
    capabilities.includes(screen.capability),
  );
}

export function getScreenHref(
  workspace: string,
  screen: ScreenDefinition,
  role: AppRole = screen.role,
): string {
  const path = screen.path.replace("[workspace]", encodeURIComponent(workspace));
  return `${path}?role=${role}`;
}

/**
 * The landing screen for a member holding `roles`, which arrive already ordered
 * by priority from `resolveProductionWorkspaceAccess`. Falls back to the parent
 * default so a member with no resolved role still lands somewhere renderable.
 */
export function getDefaultScreenForRoles(
  roles: readonly AppRole[],
): ScreenDefinition {
  return getDefaultScreen(roles[0] ?? "parent");
}

export function parseAppRole(value: string | undefined): AppRole {
  return appRoles.find((role) => role === value) ?? "parent";
}

/**
 * Like `parseAppRole` but without its `"parent"` default. Production routing must
 * be able to tell "no role was requested" from "parent was requested", because the
 * caller falls back to the member's highest-priority held role, not to parent.
 */
export function parseRequestedRole(
  value: string | undefined,
): AppRole | undefined {
  return appRoles.find((role) => role === value);
}
