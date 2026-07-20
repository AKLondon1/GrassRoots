import type { Capability, OrganisationScope } from "@/features/tenancy/types";
import { getDemoCapabilities } from "@/lib/access/demo-access-policy";
import type { AppRole } from "@/lib/navigation/screen-registry";

export interface DemoSession {
  id: string;
  mode: "demo";
  persistent: false;
  role: AppRole;
  subject: {
    id: string;
    kind: "adult";
    displayName: string;
  };
  organisation: {
    id: string;
    name: string;
    slug: string;
  };
  scope: OrganisationScope;
  capabilities: readonly Capability[];
}

const organisation = {
  id: "00000000-0000-4000-8000-000000000101",
  name: "Riverside Juniors",
  slug: "riverside-juniors",
} as const;

const demoPeople = {
  parent: ["00000000-0000-4000-8000-000000000201", "Alex Morgan"],
  coach: ["00000000-0000-4000-8000-000000000202", "Sam Taylor"],
  club: ["00000000-0000-4000-8000-000000000203", "Priya Shah"],
  platform: ["00000000-0000-4000-8000-000000000204", "Morgan Lee"],
} as const satisfies Record<AppRole, readonly [string, string]>;

const sessions = (Object.keys(demoPeople) as AppRole[]).map((role) => {
  const [id, displayName] = demoPeople[role];

  return {
    id: `demo-${role}`,
    mode: "demo",
    persistent: false,
    role,
    subject: { id, kind: "adult", displayName },
    organisation,
    scope: { kind: "organisation", organisationId: organisation.id },
    capabilities: getDemoCapabilities(role),
  } satisfies DemoSession;
});

export function listDemoSessions(): readonly DemoSession[] {
  return sessions;
}

export function getDemoSession(role: AppRole): DemoSession {
  const session = sessions.find((candidate) => candidate.role === role);
  if (!session) throw new Error("No demo session is configured for this role.");
  return session;
}
