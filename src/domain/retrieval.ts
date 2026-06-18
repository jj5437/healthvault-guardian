import type { HealthChunk } from "./documents";

export interface RetrievalResult {
  chunk: HealthChunk;
  score: number;
}

export function retrieveRelevantChunks(
  chunks: HealthChunk[],
  question: string,
  limit: number
): RetrievalResult[] {
  const queryTokens = tokenize(question);

  return chunks
    .map((chunk) => ({
      chunk,
      score: scoreText(chunk.text, queryTokens)
    }))
    .sort((left, right) => right.score - left.score || left.chunk.id.localeCompare(right.chunk.id))
    .slice(0, limit);
}

function scoreText(text: string, queryTokens: Set<string>): number {
  const chunkTokens = tokenize(text);
  let score = 0;

  for (const token of queryTokens) {
    if (chunkTokens.has(token)) {
      score += token.length > 5 ? 2 : 1;
    }
  }

  return score;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2)
  );
}
