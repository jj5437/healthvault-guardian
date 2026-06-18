import { describe, expect, it } from "vitest";
import { chunkHealthDocument, normalizeHealthDocument } from "../src/domain/documents";

describe("health document chunking", () => {
  it("creates stable chunk ids and preserves source metadata", () => {
    const doc = normalizeHealthDocument({
      id: "lab-2026-05",
      sourceName: "May lipid panel",
      kind: "lab",
      content: "Total cholesterol 219 mg/dL.\nLDL cholesterol 142 mg/dL.\nHDL cholesterol 51 mg/dL.",
      capturedAt: "2026-05-18"
    });

    const chunks = chunkHealthDocument(doc, { maxChars: 42 });

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toMatchObject({
      id: "lab-2026-05:chunk:0",
      documentId: "lab-2026-05",
      sourceName: "May lipid panel",
      kind: "lab",
      capturedAt: "2026-05-18"
    });
    expect(chunks.map((chunk) => chunk.text)).toEqual([
      "Total cholesterol 219 mg/dL.",
      "LDL cholesterol 142 mg/dL.",
      "HDL cholesterol 51 mg/dL."
    ]);
  });
});
