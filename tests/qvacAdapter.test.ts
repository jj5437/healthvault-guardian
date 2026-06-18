import { describe, expect, it } from "vitest";
import { QvacAdapter, type QvacRuntime } from "../src/ai/qvacAdapter";
import type { HealthChunk } from "../src/domain/documents";

const chunks: HealthChunk[] = [
  {
    id: "lipids:chunk:0",
    documentId: "lipids",
    sourceName: "May lipid panel",
    kind: "lab",
    text: "LDL cholesterol was 142 mg/dL. Total cholesterol was 219 mg/dL.",
    index: 0
  },
  {
    id: "sleep:chunk:0",
    documentId: "sleep",
    sourceName: "Wearable sleep summary",
    kind: "wearable",
    text: "Sleep averaged 6.7 hours per night.",
    index: 0
  }
];

describe("QvacAdapter", () => {
  it("loads MedPsy through QVAC, builds a grounded prompt, and records evidence", async () => {
    const calls: string[] = [];
    const runtime: QvacRuntime = {
      loadModel: async (options) => {
        calls.push(`load:${options.modelType}:${String(options.modelSrc)}`);
        return "loaded-medpsy";
      },
      completion: (params) => {
        calls.push(`completion:${params.modelId}`);
        return {
          final: Promise.resolve({
            contentText: JSON.stringify({
              answer: "Your LDL was above the common optimal range. Ask your clinician about risk factors.",
              citedChunkIds: ["lipids:chunk:0"]
            }),
            raw: { fullText: "" },
            toolCalls: [],
            stats: {
              promptTokens: 111,
              generatedTokens: 19,
              timeToFirstToken: 42,
              tokensPerSecond: 9.5
            }
          })
        };
      },
      unloadModel: async ({ modelId }) => {
        calls.push(`unload:${modelId}`);
      }
    };
    const adapter = new QvacAdapter(
      {
        modelName: "qvac/MedPsy-1.7B-GGUF",
        modelSrc: "pear://medpsy/model.gguf"
      },
      runtime
    );

    const response = await adapter.complete({
      question: "Explain my LDL result.",
      context: chunks
    });
    await adapter.unload();

    expect(calls).toEqual([
      "load:llamacpp-completion:pear://medpsy/model.gguf",
      "completion:loaded-medpsy",
      "unload:loaded-medpsy"
    ]);
    expect(response.answer).toContain("LDL");
    expect(response.citedChunkIds).toEqual(["lipids:chunk:0"]);
    expect(response.evidence).toMatchObject({
      type: "inference",
      model: "qvac/MedPsy-1.7B-GGUF",
      adapterMode: "qvac",
      inputTokens: 111,
      outputTokens: 19,
      ttftMs: 42,
      tokensPerSecond: 9.5
    });
  });

  it("extracts the patient answer when a local model returns reasoning before JSON", async () => {
    const runtime: QvacRuntime = {
      loadModel: async () => "loaded-medpsy",
      completion: () => ({
        final: Promise.resolve({
          contentText:
            '<think>Use the lipid record and avoid diagnosis.</think>\n{"answer":"LDL cholesterol was 142 mg/dL in the May lipid panel. Ask your clinician about your overall cardiovascular risk and target LDL range.","citedChunkIds":["lipids:chunk:0"]}',
          stats: {
            promptTokens: 100,
            generatedTokens: 24,
            timeToFirstToken: 35,
            tokensPerSecond: 8
          }
        })
      }),
      unloadModel: async () => {}
    };
    const adapter = new QvacAdapter({ modelName: "qvac/MedPsy-1.7B-GGUF" }, runtime);

    const response = await adapter.complete({
      question: "Explain my LDL result.",
      context: chunks
    });

    expect(response.answer).toContain("LDL cholesterol was 142 mg/dL");
    expect(response.answer).not.toContain("<think>");
    expect(response.answer).not.toContain("citedChunkIds");
    expect(response.citedChunkIds).toEqual(["lipids:chunk:0"]);
  });

  it("passes the configured generation budget to QVAC completion", async () => {
    let observedPredict: number | undefined;
    let observedPrompt = "";
    const runtime: QvacRuntime = {
      loadModel: async () => "loaded-medpsy",
      completion: (params) => {
        observedPredict = params.generationParams?.predict;
        observedPrompt = params.history[0].content;
        return {
          final: Promise.resolve({
            contentText: JSON.stringify({
              answer: "Ask your clinician about LDL targets.",
              citedChunkIds: ["lipids:chunk:0"]
            })
          })
        };
      },
      unloadModel: async () => {}
    };
    const adapter = new QvacAdapter({ modelName: "qvac/MedPsy-1.7B-GGUF", predictTokens: 1536 }, runtime);

    await adapter.complete({
      question: "Explain my LDL result.",
      context: chunks
    });

    expect(observedPredict).toBe(1536);
    expect(observedPrompt).toContain("Do not write hidden reasoning");
  });

  it("uses the first valid JSON answer when the model repeats JSON after prose", async () => {
    const repeatedJson = JSON.stringify({
      answer: "Patient should discuss diet, exercise, weight, and family history with their clinician.",
      citedChunkIds: ["lipids:chunk:0"]
    });
    const runtime: QvacRuntime = {
      loadModel: async () => "loaded-medpsy",
      completion: () => ({
        final: Promise.resolve({
          contentText: `Patient should discuss diet, exercise, weight, and family history.\n\n${repeatedJson}\n\n${repeatedJson}`
        })
      }),
      unloadModel: async () => {}
    };
    const adapter = new QvacAdapter({ modelName: "qvac/MedPsy-1.7B-GGUF" }, runtime);

    const response = await adapter.complete({
      question: "Suggest non-diagnostic topics for my visit.",
      context: chunks
    });

    expect(response.answer).toBe("Patient should discuss diet, exercise, weight, and family history with their clinician.");
    expect(response.answer).not.toContain('{"answer"');
    expect(response.citedChunkIds).toEqual(["lipids:chunk:0"]);
  });

  it("cleans JSON-like wrappers when cited chunk ids are emitted inside the answer text", async () => {
    const runtime: QvacRuntime = {
      loadModel: async () => "loaded-medpsy",
      completion: () => ({
        final: Promise.resolve({
          contentText:
            '{"answer":"Your LDL of 142 mg/dL is elevated. Discuss target LDL and lifestyle changes with your doctor. (citedChunkIds:["lipids:chunk:0"])"}'
        })
      }),
      unloadModel: async () => {}
    };
    const adapter = new QvacAdapter({ modelName: "qvac/MedPsy-1.7B-GGUF" }, runtime);

    const response = await adapter.complete({
      question: "Explain my LDL result.",
      context: chunks
    });

    expect(response.answer).toBe(
      "Your LDL of 142 mg/dL is elevated. Discuss target LDL and lifestyle changes with your doctor."
    );
    expect(response.answer).not.toContain('{"answer"');
    expect(response.answer).not.toContain("citedChunkIds");
    expect(response.citedChunkIds).toEqual(["lipids:chunk:0"]);
  });

  it("removes capitalized citation metadata from otherwise clean answer text", async () => {
    const runtime: QvacRuntime = {
      loadModel: async () => "loaded-medpsy",
      completion: () => ({
        final: Promise.resolve({
          contentText:
            'Your LDL result (142 mg/dL) indicates elevated levels. Questions to ask: risk level and target LDL goal. CitedChunkIds":["lipids:chunk:0'
        })
      }),
      unloadModel: async () => {}
    };
    const adapter = new QvacAdapter({ modelName: "qvac/MedPsy-1.7B-GGUF" }, runtime);

    const response = await adapter.complete({
      question: "Explain my LDL result.",
      context: chunks
    });

    expect(response.answer).toBe(
      "Your LDL result (142 mg/dL) indicates elevated levels. Questions to ask: risk level and target LDL goal."
    );
    expect(response.answer).not.toContain("CitedChunkIds");
    expect(response.citedChunkIds).toEqual(["lipids:chunk:0"]);
  });
});
