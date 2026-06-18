import type { HealthAiAdapter } from "../ai/types";
import type { HealthChunk } from "../domain/documents";
import type { InferenceEvent } from "../domain/evidence";
import { retrieveRelevantChunks } from "../domain/retrieval";
import { classifyQuestionSafety } from "../domain/safety";

export interface AnswerHealthQuestionInput {
  question: string;
  chunks: HealthChunk[];
  adapter: HealthAiAdapter;
}

export interface Citation {
  chunkId: string;
  sourceName: string;
  text: string;
}

export type AnswerResult =
  | {
      status: "blocked";
      answer: string;
      citations: Citation[];
      evidence: InferenceEvent[];
    }
  | {
      status: "answered";
      answer: string;
      citations: Citation[];
      evidence: InferenceEvent[];
    };

export async function answerHealthQuestion(input: AnswerHealthQuestionInput): Promise<AnswerResult> {
  const safety = classifyQuestionSafety(input.question);

  if (!safety.allowed) {
    return {
      status: "blocked",
      answer: `${safety.message} If symptoms feel urgent, seek urgent care now.`,
      citations: [],
      evidence: []
    };
  }

  const retrieval = retrieveRelevantChunks(input.chunks, input.question, 4).filter((result) => result.score > 0);
  const selectedChunks = retrieval.length > 0 ? retrieval.map((result) => result.chunk) : input.chunks.slice(0, 2);
  const completion = await input.adapter.complete({
    question: input.question,
    context: selectedChunks
  });
  const citedChunks = selectedChunks.filter((chunk) => completion.citedChunkIds.includes(chunk.id));

  return {
    status: "answered",
    answer: completion.answer,
    citations: citedChunks.map((chunk) => ({
      chunkId: chunk.id,
      sourceName: chunk.sourceName,
      text: chunk.text
    })),
    evidence: [completion.evidence]
  };
}
