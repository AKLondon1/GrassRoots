const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseUuidCursor(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && uuidPattern.test(candidate) ? candidate : undefined;
}

export function keysetPage<T extends { id: string }>(rows: T[], pageSize = 20) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error("Page size must be between 1 and 100.");
  const items = rows.slice(0, pageSize);
  return { items, nextCursor: rows.length > pageSize ? items.at(-1)?.id : undefined } as const;
}
