import { describe, expect, it } from "vitest";
import { classifyQuestionSafety } from "../src/domain/safety";

describe("health safety policy", () => {
  it("blocks emergency requests", () => {
    const result = classifyQuestionSafety("I have chest pain and cannot breathe, what should I do?");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("emergency");
  });

  it("blocks requests for a definitive diagnosis", () => {
    const result = classifyQuestionSafety("Diagnose me based on these symptoms.");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("diagnosis");
  });

  it("blocks prescription change requests", () => {
    const result = classifyQuestionSafety("Should I stop taking my statin or change the dose?");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("prescription");
  });

  it("allows education and doctor preparation requests", () => {
    const result = classifyQuestionSafety("Explain my LDL result and list questions for my doctor.");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("allowed");
  });
});
