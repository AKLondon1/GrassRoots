import { describe, expect, it } from "vitest";

import {
  applyPeopleImport,
  previewPeopleCsv,
} from "@/features/people/import/service";
import { DemoRepository } from "@/lib/demo/repository";
import { createRiversideDemoSeed } from "@/lib/demo/seed";

const organisationId = "00000000-0000-4000-8000-000000000101";
const validCsv = `player_first_name,player_last_name,date_of_birth,team,guardian_name,guardian_email,relationship,communication,payments,consent
Amelia,Reed,2019-02-14,Under 7s,Casey Reed,casey.reed@example.test,Parent,true,true,true`;

describe("people CSV import", () => {
  it("returns row-level errors for malformed values", () => {
    const preview = previewPeopleCsv(
      `player_first_name,player_last_name,date_of_birth,team,guardian_name,guardian_email,relationship,communication,payments,consent
Jamie,,not-a-date,Under 11s,Alex Morgan,not-an-email,Parent,true,maybe,true`,
      { organisationId, existingDedupeKeys: [], validTeamNames: ["Under 11s"] },
    );

    expect(preview.status).toBe("preview");
    expect(preview.applied).toBe(false);
    expect(preview.rows[0].status).toBe("invalid");
    expect(preview.rows[0].errors.map(({ field }) => field)).toEqual(
      expect.arrayContaining([
        "player_last_name",
        "date_of_birth",
        "guardian_email",
        "payments",
      ]),
    );
  });

  it("marks duplicate rows from the file and existing repository", () => {
    const duplicateCsv = `${validCsv}\nAmelia,Reed,2019-02-14,Under 7s,Casey Reed,casey.reed@example.test,Parent,true,true,true`;
    const firstPreview = previewPeopleCsv(duplicateCsv, {
      organisationId,
      existingDedupeKeys: [],
      validTeamNames: ["Under 7s"],
    });

    expect(firstPreview.rows.map(({ status }) => status)).toEqual([
      "ready",
      "duplicate",
    ]);

    const existingPreview = previewPeopleCsv(validCsv, {
      organisationId,
      existingDedupeKeys: [firstPreview.rows[0].dedupeKey!],
      validTeamNames: ["Under 7s"],
    });
    expect(existingPreview.rows[0]).toMatchObject({
      status: "duplicate",
      duplicateReason: "already-exists",
    });
  });

  it("does not mutate the repository during preview and applies only explicitly", () => {
    const repository = new DemoRepository(createRiversideDemoSeed());
    const before = repository.snapshot(organisationId);
    const preview = repository.previewPeopleImport(organisationId, validCsv);

    expect(preview.applied).toBe(false);
    expect(repository.snapshot(organisationId)).toEqual(before);

    const result = applyPeopleImport(preview, repository);
    expect(result).toMatchObject({ status: "applied", appliedCount: 1 });
    expect(repository.snapshot(organisationId).players).toHaveLength(
      before.players.length + 1,
    );
    expect(
      repository
        .snapshot(organisationId)
        .guardians.find(({ email }) => email === "casey.reed@example.test"),
    ).toMatchObject({ membershipId: null, status: "pending" });
    expect(() => applyPeopleImport(preview, repository)).toThrow(
      /already been applied/i,
    );
  });

  it("refuses to apply a preview containing row errors", () => {
    const repository = new DemoRepository(createRiversideDemoSeed());
    const preview = repository.previewPeopleImport(
      organisationId,
      validCsv.replace("casey.reed@example.test", "bad-email"),
    );

    expect(() => applyPeopleImport(preview, repository)).toThrow(
      /resolve every row error/i,
    );
  });

  it("rejects future birth dates and unknown teams during preview", () => {
    const preview = previewPeopleCsv(
      validCsv
        .replace("2019-02-14", "2999-02-14")
        .replace("Under 7s", "Under 9s"),
      {
        organisationId,
        existingDedupeKeys: [],
        validTeamNames: ["Under 7s", "Under 11s"],
      },
    );

    expect(preview.rows[0].status).toBe("invalid");
    expect(preview.rows[0].errors.map(({ field }) => field)).toEqual(
      expect.arrayContaining(["date_of_birth", "team"]),
    );
  });

  it("revalidates the team atomically when rows are applied", () => {
    const repository = new DemoRepository(createRiversideDemoSeed());
    const before = repository.snapshot(organisationId);
    const parsed = previewPeopleCsv(validCsv, {
      organisationId,
      existingDedupeKeys: [],
      validTeamNames: ["Under 7s"],
    }).rows[0].value!;

    expect(() =>
      repository.applyPeopleRows("manual-preview", organisationId, [
        { ...parsed, team: "Unknown team" },
      ]),
    ).toThrow(/team is not available/i);
    expect(repository.snapshot(organisationId)).toEqual(before);
  });
});
