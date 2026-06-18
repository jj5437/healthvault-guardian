import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolveQvacModelConfig } from "./src/ai/qvacConfig";
import { QvacAdapter } from "./src/ai/qvacAdapter";
import type { AiCompletionRequest } from "./src/ai/types";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), qvacApiPlugin(env)],
    test: {
      environment: "node",
      include: ["tests/**/*.test.ts"]
    }
  };
});

function qvacApiPlugin(env: Record<string, string>): Plugin {
  let adapter: QvacAdapter | null = null;

  return {
    name: "healthvault-qvac-api",
    configureServer(server) {
      server.middlewares.use("/api/qvac/complete", async (request, response) => {
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.end("Method not allowed");
          return;
        }

        try {
          const body = await readJsonBody<AiCompletionRequest>(request);
          const qvacConfig = resolveQvacModelConfig(env);
          adapter ??= new QvacAdapter({
            modelName: qvacConfig.modelName,
            modelSrc: qvacConfig.modelSrc,
            predictTokens: qvacConfig.predictTokens
          });
          const result = await adapter.complete(body);

          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify(result));
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : "QVAC completion failed";
          response.statusCode = 500;
          response.end(message);
        }
      });

      server.httpServer?.once("close", () => {
        void adapter?.unload();
      });
    }
  };
}

function readJsonBody<T>(request: import("node:http").IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("error", reject);
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as T);
      } catch (caught) {
        reject(caught);
      }
    });
  });
}
