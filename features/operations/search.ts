export interface SearchRecord {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly requiredCapability: string;
  readonly text: string;
}

export function searchKnowledge(records: readonly SearchRecord[], query: string, capabilities: readonly string[]) {
  const normalised = query.trim().toLocaleLowerCase("en-GB");
  if (!normalised) return [];
  const allowed = new Set(capabilities);
  return records.filter((record) => allowed.has(record.requiredCapability) && `${record.title} ${record.text}`.toLocaleLowerCase("en-GB").includes(normalised));
}

