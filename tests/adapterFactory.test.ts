import { describe, expect, it } from "vitest";
import { createHealthAiAdapter } from "../src/ai/adapterFactory";
import { RemoteQvacAdapter } from "../src/ai/remoteQvacAdapter";

describe("adapter factory", () => {
  it("uses the deterministic local demo adapter by default", () => {
    const bundle = createHealthAiAdapter({});

    expect(bundle.mode).toBe("local-demo");
    expect(bundle.label).toBe("Adapter: deterministic local demo");
  });

  it("uses QVAC when requested by runtime config", () => {
    const bundle = createHealthAiAdapter({
      adapterMode: "qvac"
    });

    expect(bundle.mode).toBe("qvac");
    expect(bundle.label).toBe("Adapter: QVAC MedPsy local runtime");
    expect(bundle.adapter).toBeInstanceOf(RemoteQvacAdapter);
  });
});
