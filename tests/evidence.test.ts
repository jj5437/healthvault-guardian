import { describe, expect, it } from "vitest";
import { createInferenceEvent, validateInferenceEvent } from "../src/domain/evidence";

describe("evidence events", () => {
  it("creates a valid inference evidence event", () => {
    const event = createInferenceEvent({
      model: "qvac/MedPsy-1.7B-GGUF",
      adapterMode: "qvac",
      prompt: "Explain LDL cholesterol using cited context.",
      inputTokens: 120,
      outputTokens: 80,
      ttftMs: 320,
      tokensPerSecond: 18.5,
      durationMs: 4640
    });

    expect(validateInferenceEvent(event)).toEqual([]);
    expect(event.promptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(event.type).toBe("inference");
  });

  it("hashes prompts with standard SHA-256", () => {
    const event = createInferenceEvent({
      model: "qvac/MedPsy-1.7B-GGUF",
      adapterMode: "qvac",
      prompt: "abc",
      inputTokens: 1,
      outputTokens: 1,
      ttftMs: 1,
      tokensPerSecond: 1,
      durationMs: 1
    });

    expect(event.promptHash).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("rejects incomplete inference metrics", () => {
    const event = {
      type: "inference",
      timestamp: "2026-06-03T00:00:00.000Z",
      model: "qvac/MedPsy-1.7B-GGUF",
      adapterMode: "qvac",
      promptHash: "abc",
      inputTokens: 120,
      outputTokens: 80,
      durationMs: 4640
    };

    expect(validateInferenceEvent(event)).toContain("ttftMs must be a non-negative number");
    expect(validateInferenceEvent(event)).toContain("tokensPerSecond must be a positive number");
  });
});
