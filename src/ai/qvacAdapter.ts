import { createInferenceEvent } from "../domain/evidence";
import type { AiCompletionRequest, AiCompletionResponse, HealthAiAdapter } from "./types";

export interface QvacAdapterOptions {
  modelName: string;
  modelSrc?: string;
  ctxSize?: number;
  predictTokens?: number;
  temperature?: number;
  seed?: number;
  clearStorageOnUnload?: boolean;
}

export interface QvacLoadModelOptions {
  modelSrc: string;
  modelType: "llamacpp-completion";
  modelConfig?: {
    ctx_size?: number;
    temp?: number;
    predict?: number;
    seed?: number;
    system_prompt?: string;
  };
}

export interface QvacCompletionFinal {
  contentText: string;
  raw?: {
    fullText?: string;
  };
  stats?: {
    promptTokens?: number;
    generatedTokens?: number;
    timeToFirstToken?: number;
    tokensPerSecond?: number;
  };
}

export interface QvacCompletionRun {
  final: Promise<QvacCompletionFinal>;
}

export interface QvacRuntime {
  loadModel(options: QvacLoadModelOptions): Promise<string>;
  completion(params: {
    modelId: string;
    history: { role: string; content: string }[];
    stream: boolean;
    generationParams?: {
      temp?: number;
      predict?: number;
      seed?: number;
    };
  }): QvacCompletionRun;
  unloadModel(params: { modelId: string; clearStorage?: boolean; autoClose?: boolean }): Promise<void>;
}

export class QvacAdapter implements HealthAiAdapter {
  private loadedModelId: string | null = null;
  private resolvedRuntimePromise: Promise<QvacRuntime> | null = null;

  constructor(
    private readonly options: QvacAdapterOptions,
    private readonly runtime: QvacRuntime | Promise<QvacRuntime> | null = null
  ) {}

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const runtime = await this.getRuntime();
    const modelId = await this.load(runtime);
    const prompt = buildGroundedHealthPrompt(request);
    const startedAt = performance.now();
    const run = runtime.completion({
      modelId,
      history: [{ role: "user", content: prompt }],
      stream: true,
      generationParams: {
        temp: this.options.temperature ?? 0.2,
        predict: this.options.predictTokens ?? 1024,
        seed: this.options.seed
      }
    });
    const final = await run.final;
    const durationMs = Math.max(1, Math.round(performance.now() - startedAt));
    const parsed = parseQvacAnswer(final.contentText, request.context.map((chunk) => chunk.id));

    return {
      answer: parsed.answer,
      citedChunkIds: parsed.citedChunkIds,
      evidence: createInferenceEvent({
        model: this.options.modelName,
        adapterMode: "qvac",
        prompt,
        inputTokens: final.stats?.promptTokens ?? estimateTokens(prompt),
        outputTokens: final.stats?.generatedTokens ?? estimateTokens(parsed.answer),
        ttftMs: final.stats?.timeToFirstToken ?? durationMs,
        tokensPerSecond: final.stats?.tokensPerSecond ?? estimateTokens(parsed.answer) / (durationMs / 1000),
        durationMs
      })
    };
  }

  async unload(): Promise<void> {
    if (!this.loadedModelId) return;

    const runtime = await this.getRuntime();
    await runtime.unloadModel({
      modelId: this.loadedModelId,
      clearStorage: this.options.clearStorageOnUnload ?? false,
      autoClose: true
    });
    this.loadedModelId = null;
  }

  private async getRuntime(): Promise<QvacRuntime> {
    if (!this.resolvedRuntimePromise) {
      this.resolvedRuntimePromise = Promise.resolve(this.runtime ?? loadDefaultQvacRuntime());
    }
    return this.resolvedRuntimePromise;
  }

  private async load(runtime: QvacRuntime): Promise<string> {
    if (this.loadedModelId) return this.loadedModelId;

    this.loadedModelId = await runtime.loadModel({
      modelSrc: this.options.modelSrc ?? this.options.modelName,
      modelType: "llamacpp-completion",
      modelConfig: {
        ctx_size: this.options.ctxSize ?? 4096,
        temp: this.options.temperature ?? 0.2,
        predict: this.options.predictTokens ?? 1024,
        seed: this.options.seed,
        system_prompt: HEALTH_SYSTEM_PROMPT
      }
    });
    return this.loadedModelId;
  }
}

const HEALTH_SYSTEM_PROMPT =
  "You are HealthVault Guardian, a local patient-education assistant. Use only provided records, cite chunk IDs, avoid diagnosis, and recommend discussing decisions with a qualified clinician. Do not write hidden reasoning, analysis, chain-of-thought, markdown, or commentary about the JSON format.";

function buildGroundedHealthPrompt(request: AiCompletionRequest): string {
  const context = request.context
    .map((chunk, index) => {
      return `[${index + 1}] chunkId=${chunk.id} source=${chunk.sourceName} kind=${chunk.kind}\n${chunk.text}`;
    })
    .join("\n\n");

  return `${HEALTH_SYSTEM_PROMPT}

Return exactly one compact JSON object and nothing else:
{"answer":"patient-facing educational answer grounded in the records, with concise bullet-like sentences if useful","citedChunkIds":["chunk id"]}

Question:
${request.question}

Records:
${context}`;
}

function parseQvacAnswer(text: string, fallbackChunkIds: string[]): { answer: string; citedChunkIds: string[] } {
  const trimmed = stripReasoning(text.trim());
  const jsonCandidate = extractJsonObject(trimmed);

  try {
    const parsed = JSON.parse(jsonCandidate ?? trimmed) as { answer?: unknown; citedChunkIds?: unknown };
    const answer = sanitizePatientAnswer(typeof parsed.answer === "string" ? parsed.answer : trimmed);
    const citedChunkIds = Array.isArray(parsed.citedChunkIds)
      ? parsed.citedChunkIds.filter((id): id is string => fallbackChunkIds.includes(String(id))).map(String)
      : [];

    return {
      answer,
      citedChunkIds: citedChunkIds.length > 0 ? citedChunkIds : fallbackChunkIds
    };
  } catch {
    const looseAnswer = extractLooseAnswer(trimmed);
    return {
      answer: sanitizePatientAnswer(looseAnswer ?? trimmed),
      citedChunkIds: extractMentionedChunkIds(trimmed, fallbackChunkIds)
    };
  }
}

function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function extractJsonObject(text: string): string | null {
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
      const char = text[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = inString;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === "{") depth += 1;
      if (char === "}") depth -= 1;

      if (depth === 0) {
        const candidate = text.slice(start, index + 1);
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          break;
        }
      }
    }
  }

  return null;
}

function extractLooseAnswer(text: string): string | null {
  const match = text.match(/"answer"\s*:\s*"/);
  if (!match || match.index === undefined) return null;

  const answerStart = match.index + match[0].length;
  const afterAnswer = text.slice(answerStart);
  const citedMarker = afterAnswer.search(/\(?\s*citedChunkIds\s*:/);
  const closingMarker = afterAnswer.search(/"\s*,\s*"[A-Za-z0-9_]+"/);
  const endCandidates = [citedMarker, closingMarker].filter((index) => index >= 0);
  const answerEnd = endCandidates.length > 0 ? Math.min(...endCandidates) : afterAnswer.length;

  return afterAnswer.slice(0, answerEnd);
}

function sanitizePatientAnswer(answer: string): string {
  return answer
    .replace(/^\s*\{\s*"answer"\s*:\s*"/, "")
    .replace(/\s*(\.?)\s*\(?\s*"?citedChunkIds"?\s*"?\s*:\s*\[[\s\S]*$/i, "$1")
    .replace(/\s*(\.?)\s*\(?\s*"?citedChunkIds"?\s*"?\s*:[\s\S]*$/i, "$1")
    .replace(/["'}\]\s]+$/g, "")
    .replace(/\\"/g, '"')
    .trim();
}

function extractMentionedChunkIds(text: string, fallbackChunkIds: string[]): string[] {
  const mentioned = fallbackChunkIds.filter((id) => text.includes(id));
  return mentioned.length > 0 ? mentioned : fallbackChunkIds;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.3));
}

async function loadDefaultQvacRuntime(): Promise<QvacRuntime> {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string
  ) => Promise<QvacRuntime>;
  return dynamicImport("@qvac/sdk");
}
