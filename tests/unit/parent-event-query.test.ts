import { describe, expect, it } from "vitest";

import {
  eventColumns,
  teamName,
  type EventRow,
} from "@/features/screens/parent/sections/shared";

describe("parent event query", () => {
  it("loads team names through the event relationship PostgREST exposes", () => {
    expect(eventColumns).toBe(
      "id,team_id,starts_at,ends_at,response_deadline,location_name,status,events(title,kind,teams(name))",
    );

    expect(
      teamName({
        events: { teams: { name: "Under 11s" } },
      } as EventRow),
    ).toBe("Under 11s");
  });
});
