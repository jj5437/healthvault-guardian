export interface QvacModelConfigEnv {
  VITE_QVAC_MODEL_NAME?: string;
  VITE_QVAC_MODEL_SRC?: string;
  VITE_QVAC_PREDICT_TOKENS?: string;
}

export interface QvacModelConfig {
  modelName: string;
  modelSrc?: string;
  predictTokens: number;
}

const DEFAULT_QVAC_MODEL_NAME = "qvac/MedPsy-1.7B-GGUF";
const DEFAULT_QVAC_PREDICT_TOKENS = 1024;
const PLACEHOLDER_MODEL_SRC = "/absolute/path/to/medpsy.gguf";

export function resolveQvacModelConfig(env: QvacModelConfigEnv): QvacModelConfig {
  const modelName = env.VITE_QVAC_MODEL_NAME || DEFAULT_QVAC_MODEL_NAME;
  const modelSrc = env.VITE_QVAC_MODEL_SRC?.trim();
  const predictTokens = resolvePositiveInteger(env.VITE_QVAC_PREDICT_TOKENS, DEFAULT_QVAC_PREDICT_TOKENS);

  if (modelSrc === PLACEHOLDER_MODEL_SRC) {
    throw new Error(
      `Replace VITE_QVAC_MODEL_SRC with a real local MedPsy GGUF path or remove it to use ${modelName} as the QVAC model source.`
    );
  }

  return {
    modelName,
    modelSrc: modelSrc || undefined,
    predictTokens
  };
}

function resolvePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
