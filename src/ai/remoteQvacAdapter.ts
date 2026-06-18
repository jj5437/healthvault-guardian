import type { AiCompletionRequest, AiCompletionResponse, HealthAiAdapter } from "./types";

export class RemoteQvacAdapter implements HealthAiAdapter {
  constructor(private readonly endpoint = "/api/qvac/complete") {}

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `QVAC request failed with status ${response.status}`);
    }

    return (await response.json()) as AiCompletionResponse;
  }
}
