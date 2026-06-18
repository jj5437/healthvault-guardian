import { describe, expect, it } from "vitest";
import { retrieveRelevantChunks } from "../src/domain/retrieval";
import type { HealthChunk } from "../src/domain/documents";

describe("local retrieval", () => {
  it("ranks a cholesterol chunk above unrelated chunks", () => {
    const chunks: HealthChunk[] = [
      {
        id: "a",
        documentId: "doc-a",
        sourceName: "Lipid panel",
        kind: "lab",
        text: "LDL cholesterol was 142 mg/dL and total cholesterol was 219 mg/dL.",
        index: 0
      },
      {
        id: "b",
        documentId: "doc-b",
        sourceName: "Visit note",
        kind: "note",
        text: "Patient reports better sleep and walking three times per week.",
        index: 0
      }
    ];

    const results = retrieveRelevantChunks(chunks, "What does my cholesterol result mean?", 2);

    expect(results[0].chunk.id).toBe("a");
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });
});
