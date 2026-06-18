import { describe, expect, it } from "vitest";
import { answerHealthQuestion } from "../src/app/answerPipeline";
import { createLocalDemoAdapter } from "../src/ai/localDemoAdapter";
import type { HealthChunk } from "../src/domain/documents";

const chunks: HealthChunk[] = [
  {
    id: "lipids:chunk:0",
    documentId: "lipids",
    sourceName: "May lipid panel",
    kind: "lab",
    text: "LDL cholesterol was 142 mg/dL. Total cholesterol was 219 mg/dL.",
    index: 0
  }
];

describe("answer pipeline", () => {
  it("refuses unsafe prompts before calling the AI adapter", async () => {
    const adapter = createLocalDemoAdapter();

    const result = await answerHealthQuestion({
      question: "I have chest pain and cannot breathe. Diagnose me now.",
      chunks,
      adapter
    });

    expect(result.status).toBe("blocked");
    expect(result.answer).toContain("urgent");
    expect(adapter.calls).toHaveLength(0);
  });

  it("answers allowed prompts with citations and evidence", async () => {
    const adapter = createLocalDemoAdapter();

    const result = await answerHealthQuestion({
      question: "Explain my LDL result and give questions for my doctor.",
      chunks,
      adapter
    });

    expect(result.status).toBe("answered");
    expect(result.answer).toContain("LDL cholesterol");
    expect(result.citations).toEqual([
      {
        chunkId: "lipids:chunk:0",
        sourceName: "May lipid panel",
        text: "LDL cholesterol was 142 mg/dL. Total cholesterol was 219 mg/dL."
      }
    ]);
    expect(result.evidence).toHaveLength(1);
    expect(adapter.calls).toHaveLength(1);
  });
});
