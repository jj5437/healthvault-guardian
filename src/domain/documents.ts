export type HealthDocumentKind = "lab" | "note" | "wearable" | "insurance" | "other";

export interface HealthDocumentInput {
  id: string;
  sourceName: string;
  kind: HealthDocumentKind;
  content: string;
  capturedAt?: string;
}

export interface HealthDocument extends HealthDocumentInput {
  content: string;
}

export interface HealthChunk {
  id: string;
  documentId: string;
  sourceName: string;
  kind: HealthDocumentKind;
  text: string;
  index: number;
  capturedAt?: string;
}

export interface ChunkOptions {
  maxChars: number;
}

export function normalizeHealthDocument(input: HealthDocumentInput): HealthDocument {
  return {
    ...input,
    content: input.content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n")
  };
}

export function chunkHealthDocument(document: HealthDocument, options: ChunkOptions): HealthChunk[] {
  const lines = document.content.split("\n").filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (current && next.length > options.maxChars) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.map((text, index) => ({
    id: `${document.id}:chunk:${index}`,
    documentId: document.id,
    sourceName: document.sourceName,
    kind: document.kind,
    text,
    index,
    capturedAt: document.capturedAt
  }));
}
