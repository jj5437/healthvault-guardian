import { normalizeHealthDocument, type HealthDocument, type HealthDocumentKind } from "./documents";

export interface ImportDocumentInput {
  sourceName: string;
  kind: HealthDocumentKind;
  content: string;
  capturedAt?: string;
}

export function createDocumentFromText(input: ImportDocumentInput): HealthDocument {
  return normalizeHealthDocument({
    id: buildDocumentId(input.sourceName, input.capturedAt),
    sourceName: input.sourceName.trim() || "Imported record",
    kind: input.kind,
    capturedAt: input.capturedAt,
    content: input.content
  });
}

export function createDocumentFromCsv(input: ImportDocumentInput): HealthDocument {
  const rows = parseCsv(input.content);
  if (rows.length < 2) {
    return createDocumentFromText(input);
  }

  const headers = rows[0].map(humanizeHeader);
  const lines = rows.slice(1).map((row, rowIndex) => {
    const cells = headers
      .map((header, columnIndex) => {
        const value = row[columnIndex]?.trim();
        return value ? `${header} ${value}` : "";
      })
      .filter(Boolean)
      .join("; ");
    return `Row ${rowIndex + 1}: ${cells}.`;
  });

  return normalizeHealthDocument({
    id: buildDocumentId(input.sourceName, input.capturedAt),
    sourceName: input.sourceName.trim() || "Imported CSV record",
    kind: input.kind,
    capturedAt: input.capturedAt,
    content: lines.join("\n")
  });
}

export function buildDocumentId(sourceName: string, capturedAt?: string): string {
  const base = slugify(sourceName || "imported-record");
  return capturedAt ? `${base}-${capturedAt}` : `${base}-${Date.now().toString(36)}`;
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function humanizeHeader(header: string): string {
  return header.replace(/[_-]+/g, " ").trim().toLowerCase();
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "imported-record";
}
