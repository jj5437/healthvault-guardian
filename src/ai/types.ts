import type { HealthChunk } from "../domain/documents";
import type { InferenceEvent } from "../domain/evidence";

export interface AiCompletionRequest {
  question: string;
  context: HealthChunk[];
}

export interface AiCompletionResponse {
  answer: string;
  citedChunkIds: string[];
  evidence: InferenceEvent;
}

export interface HealthAiAdapter {
  complete(request: AiCompletionRequest): Promise<AiCompletionResponse>;
}
