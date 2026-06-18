import { describe, expect, it } from "vitest";
import { resolveQvacModelConfig } from "../src/ai/qvacConfig";

describe("QVAC model config", () => {
  it("rejects the README placeholder model path", () => {
    expect(() =>
      resolveQvacModelConfig({
        VITE_QVAC_MODEL_NAME: "qvac/MedPsy-1.7B-GGUF",
        VITE_QVAC_MODEL_SRC: "/absolute/path/to/medpsy.gguf"
      })
    ).toThrow("Replace VITE_QVAC_MODEL_SRC");
  });

  it("uses the default model name when only a real model source is provided", () => {
    expect(
      resolveQvacModelConfig({
        VITE_QVAC_MODEL_SRC: "/Users/example/models/medpsy.gguf"
      })
    ).toEqual({
      modelName: "qvac/MedPsy-1.7B-GGUF",
      modelSrc: "/Users/example/models/medpsy.gguf",
      predictTokens: 1024
    });
  });

  it("uses a longer default generation budget for complete demo answers", () => {
    expect(resolveQvacModelConfig({})).toMatchObject({
      predictTokens: 1024
    });
  });

  it("allows the QVAC generation budget to be configured from the environment", () => {
    expect(
      resolveQvacModelConfig({
        VITE_QVAC_PREDICT_TOKENS: "1536"
      })
    ).toMatchObject({
      predictTokens: 1536
    });
  });
});
