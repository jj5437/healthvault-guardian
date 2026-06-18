import { createLocalDemoAdapter } from "./localDemoAdapter";
import { RemoteQvacAdapter } from "./remoteQvacAdapter";
import type { HealthAiAdapter } from "./types";

export type HealthAiAdapterMode = "local-demo" | "qvac";

export interface HealthAiAdapterConfig {
  adapterMode?: string;
}

export interface HealthAiAdapterBundle {
  mode: HealthAiAdapterMode;
  label: string;
  adapter: HealthAiAdapter;
  unload?: () => Promise<void>;
}

export function createHealthAiAdapter(config: HealthAiAdapterConfig): HealthAiAdapterBundle {
  if (config.adapterMode === "qvac") {
    return {
      mode: "qvac",
      label: "Adapter: QVAC MedPsy local runtime",
      adapter: new RemoteQvacAdapter()
    };
  }

  return {
    mode: "local-demo",
    label: "Adapter: deterministic local demo",
    adapter: createLocalDemoAdapter()
  };
}
