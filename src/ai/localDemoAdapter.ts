import { createInferenceEvent } from "../domain/evidence";
import type { AiCompletionRequest, AiCompletionResponse, HealthAiAdapter } from "./types";

export interface LocalDemoAdapter extends HealthAiAdapter {
  calls: AiCompletionRequest[];
}

export function createLocalDemoAdapter(): LocalDemoAdapter {
  const calls: AiCompletionRequest[] = [];

  return {
    calls,
    async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
      calls.push(request);
      const contextText = request.context.map((chunk) => chunk.text).join("\n");
      const prompt = `Question: ${request.question}\nContext:\n${contextText}`;
      const answer =
        "Your record mentions LDL cholesterol. This educational summary can help you discuss the result with a clinician and prepare follow-up questions.";

      return {
        answer,
        citedChunkIds: request.context.map((chunk) => chunk.id),
        evidence: createInferenceEvent({
          model: "local-demo-deterministic",
          adapterMode: "local-demo",
          prompt,
          inputTokens: estimateTokens(prompt),
          outputTokens: estimateTokens(answer),
          ttftMs: 1,
          tokensPerSecond: 1000,
          durationMs: 2
        })
      };
    }
  };
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.3));
}
