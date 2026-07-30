// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const supabase = vi.hoisted(() => ({ createClient: vi.fn() }));
const tenancy = vi.hoisted(() => ({ requireCapability: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: supabase.createClient,
}));
vi.mock("@/features/tenancy/authorise", () => ({
  requireCapability: tenancy.requireCapability,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createSquadForInstance,
  publishSquad,
  setSquadMembers,
} from "@/features/squads/production-actions";

const OUR_ORGANISATION = "11111111-1111-4111-8111-111111111111";
const OTHER_ORGANISATION = "22222222-2222-4222-8222-222222222222";
const TEAM = "33333333-3333-4333-8333-333333333333";
const SQUAD = "55555555-5555-4555-8555-555555555555";
const INSTANCE = "66666666-6666-4666-8666-666666666666";

const source = readFileSync(join(process.cwd(), "features/squads/production-actions.ts"), "utf8");

function inertClient() {
  const chain: Record<string, unknown> = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    eq: () => chain,
    in: () => chain,
    single: async () => ({ data: { id: SQUAD, event_instance_id: INSTANCE }, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    limit: async () => ({ data: [], error: null }),
    then: (resolve: (value: { data: never[]; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: [], error: null })),
  };
  return { from: () => chain };
}

function formDataOf(values: Record<string, string>) {
  const formData = new FormData();
  Object.entries(values).forEach(([key, value]) => formData.append(key, value));
  return formData;
}

const foreign = { organisationId: OTHER_ORGANISATION, workspace: "riverside", teamId: TEAM };

beforeEach(() => {
  vi.clearAllMocks();
  supabase.createClient.mockResolvedValue(inertClient());
  // "riverside" resolves to OUR_ORGANISATION, whatever the form claims.
  tenancy.requireCapability.mockResolvedValue({
    status: "allowed",
    organisationId: OUR_ORGANISATION,
    membershipId: "44444444-4444-4444-8444-444444444444",
    role: "coach",
    roles: ["coach"],
    capabilities: [],
    scopedGrants: [],
  });
});

describe("cross-organisation squad scoping", () => {
  it("refuses to open a squad under another organisation id", async () => {
    await expect(
      createSquadForInstance(formDataOf({ ...foreign, eventInstanceId: INSTANCE })),
    ).rejects.toThrow(/does not belong to this workspace/i);
  });

  it("refuses to set members under another organisation id", async () => {
    await expect(setSquadMembers(formDataOf({ ...foreign, squadId: SQUAD }))).rejects.toThrow(
      /does not belong to this workspace/i,
    );
  });

  it("refuses to publish under another organisation id", async () => {
    await expect(publishSquad(formDataOf({ ...foreign, squadId: SQUAD }))).rejects.toThrow(
      /does not belong to this workspace/i,
    );
  });

  it("propagates a refusal from the capability check", async () => {
    tenancy.requireCapability.mockRejectedValue(
      new Error("You do not have permission to do that."),
    );

    await expect(
      publishSquad(
        formDataOf({
          organisationId: OUR_ORGANISATION,
          workspace: "riverside",
          teamId: TEAM,
          squadId: SQUAD,
        }),
      ),
    ).rejects.toThrow(/permission/i);
  });
});

describe("squad action static safety", () => {
  it("exports exactly the three actions the tests cover", () => {
    const exported = [...source.matchAll(/export async function (\w+)/g)].map(
      (match) => match[1],
    );
    expect(exported.sort()).toEqual([
      "createSquadForInstance",
      "publishSquad",
      "setSquadMembers",
    ]);
  });

  it("never upserts squad_members, which has no UPDATE policy", () => {
    expect(source).not.toMatch(/from\("squad_members"\)[\s\S]{0,80}upsert/);
    expect(source).toMatch(/from\("squad_members"\)\s*\.delete\(\)/);
  });

  it("authorises every action at team scope", () => {
    expect(source).toMatch(/kind: "team",\s*\n?\s*teamId/);
    expect(source).not.toMatch(/requireCapability\([^)]*kind: "organisation"/);
  });

  it("trusts the workspace over the submitted organisation id", () => {
    expect(source).toMatch(
      /access\.organisationId !== input\.organisationId[\s\S]{0,160}does not belong to this workspace/,
    );
  });

  it("takes the publishing membership from the resolved access", () => {
    expect(source).toMatch(/published_by_membership_id: access\.membershipId/);
    expect(source).not.toMatch(/publishedByMembershipId: z\./);
  });
});
