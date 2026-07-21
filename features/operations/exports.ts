export function escapeCsvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s\u0000]*[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function createAuditedExport(input: {
  organisationId: string;
  organisationName?: string;
  actorMembershipId: string;
  capability: "reports:view";
  format: "csv" | "pdf";
  title: string;
  rows: readonly Record<string, unknown>[];
  now: string;
}) {
  if (input.capability !== "reports:view") throw new Error("Reports permission is required.");
  const headings = Object.keys(input.rows[0] ?? {});
  const watermark = `GrassRoots · ${input.organisationName ?? "Organisation"} · Confidential club export`;
  const csv = [watermark, input.title, headings.map(escapeCsvCell).join(","), ...input.rows.map((row) => headings.map((heading) => escapeCsvCell(row[heading])).join(","))].join("\r\n");
  return {
    format: input.format,
    content: input.format === "csv" ? csv : createSimplePdf(`${watermark} | ${input.title} | ${input.rows.length} records`),
    audit: { action: "export.created" as const, organisationId: input.organisationId, actorMembershipId: input.actorMembershipId, format: input.format, resourceType: input.title, watermark, rowCount: input.rows.length, createdAt: input.now },
  };
}

function createSimplePdf(value: string) {
  const safe = value.replace(/[^\x20-\x7E]/g, " ").replace(/([\\()])/g, "\\$1");
  const stream = `BT /F1 11 Tf 48 780 Td (${safe}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(new TextEncoder().encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

export interface ExportAuditWriter {
  append(record: ReturnType<typeof createAuditedExport>["audit"]): Promise<void>;
}

export async function createPersistedExport(
  input: Parameters<typeof createAuditedExport>[0],
  auditWriter: ExportAuditWriter,
) {
  const prepared = createAuditedExport(input);
  await auditWriter.append(prepared.audit);
  return prepared;
}
