import {
  peopleImportHeaders,
  peopleImportRowSchema,
  type PeopleImportRow,
} from "@/features/people/import/schema";

export interface ImportRowError {
  readonly field: string;
  readonly message: string;
}

export interface PeopleImportPreviewRow {
  readonly rowNumber: number;
  readonly status: "ready" | "duplicate" | "invalid";
  readonly value: PeopleImportRow | null;
  readonly dedupeKey?: string;
  readonly duplicateReason?: "in-file" | "already-exists";
  readonly errors: readonly ImportRowError[];
}

export interface PeopleImportPreview {
  readonly id: string;
  readonly organisationId: string;
  readonly status: "preview";
  readonly applied: false;
  readonly rows: readonly PeopleImportPreviewRow[];
  readonly summary: {
    readonly ready: number;
    readonly duplicate: number;
    readonly invalid: number;
  };
}

export interface PeopleImportWriter {
  applyPeopleRows(
    previewId: string,
    organisationId: string,
    rows: readonly PeopleImportRow[],
  ): { status: "applied"; appliedCount: number };
}

function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim().length > 0)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  row.push(value);
  if (row.some((cell) => cell.trim().length > 0)) rows.push(row);
  return rows;
}

function hash(value: string): string {
  let result = 5381;
  for (const character of value) {
    result = ((result << 5) + result) ^ character.charCodeAt(0);
  }
  return (result >>> 0).toString(36);
}

export function peopleImportDedupeKey(row: PeopleImportRow): string {
  return [
    row.player_first_name,
    row.player_last_name,
    row.date_of_birth,
    row.guardian_email,
  ]
    .map((value) => value.trim().toLowerCase())
    .join("|");
}

export function previewPeopleCsv(
  csv: string,
  options: {
    organisationId: string;
    existingDedupeKeys: readonly string[];
    validTeamNames: readonly string[];
  },
): PeopleImportPreview {
  const parsed = parseCsv(csv.trim());
  const suppliedHeaders = parsed[0]?.map((header) => header.trim()) ?? [];
  const headerErrors = peopleImportHeaders.flatMap((required) =>
    suppliedHeaders.includes(required)
      ? []
      : [{ field: required, message: `Missing required column: ${required}.` }],
  );
  const existing = new Set(options.existingDedupeKeys);
  const validTeamNames = new Set(
    options.validTeamNames.map((name) => name.trim().toLowerCase()),
  );
  const seen = new Set<string>();

  const rows = parsed.slice(1).map((cells, index): PeopleImportPreviewRow => {
    const raw = Object.fromEntries(
      suppliedHeaders.map((header, cellIndex) => [header, cells[cellIndex] ?? ""]),
    );
    const result = peopleImportRowSchema.safeParse(raw);
    const teamErrors = validTeamNames.has(String(raw.team ?? "").trim().toLowerCase())
      ? []
      : [{ field: "team", message: "Choose a team in this organisation." }];
    if (!result.success || headerErrors.length > 0 || teamErrors.length > 0) {
      return {
        rowNumber: index + 2,
        status: "invalid",
        value: null,
        errors: [
          ...headerErrors,
          ...teamErrors,
          ...(result.success
            ? []
            : result.error.issues.map((issue) => ({
                field: String(issue.path[0] ?? "row"),
                message: issue.message,
              }))),
        ],
      };
    }

    const dedupeKey = peopleImportDedupeKey(result.data);
    const duplicateReason = existing.has(dedupeKey)
      ? "already-exists"
      : seen.has(dedupeKey)
        ? "in-file"
        : undefined;
    seen.add(dedupeKey);
    return {
      rowNumber: index + 2,
      status: duplicateReason ? "duplicate" : "ready",
      value: result.data,
      dedupeKey,
      duplicateReason,
      errors: [],
    };
  });
  const summary = {
    ready: rows.filter(({ status }) => status === "ready").length,
    duplicate: rows.filter(({ status }) => status === "duplicate").length,
    invalid: rows.filter(({ status }) => status === "invalid").length,
  };

  return Object.freeze({
    id: `people-preview-${hash(`${options.organisationId}|${csv}`)}`,
    organisationId: options.organisationId,
    status: "preview" as const,
    applied: false as const,
    rows: Object.freeze(rows),
    summary: Object.freeze(summary),
  });
}

export function applyPeopleImport(
  preview: PeopleImportPreview,
  writer: PeopleImportWriter,
): { status: "applied"; appliedCount: number } {
  if (preview.summary.invalid > 0) {
    throw new Error("Resolve every row error before applying this import.");
  }
  const rows = preview.rows.flatMap((row) =>
    row.status === "ready" && row.value ? [row.value] : [],
  );
  return writer.applyPeopleRows(preview.id, preview.organisationId, rows);
}
