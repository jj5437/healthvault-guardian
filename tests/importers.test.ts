import { describe, expect, it } from "vitest";
import { createDocumentFromText, createDocumentFromCsv } from "../src/domain/importers";

describe("health record importers", () => {
  it("creates a normalized document from pasted text", () => {
    const document = createDocumentFromText({
      sourceName: "Portal message",
      kind: "note",
      capturedAt: "2026-06-04",
      content: "  Patient asked about LDL follow-up.  \n\n Clinician suggested bringing the lipid panel. "
    });

    expect(document).toMatchObject({
      id: "portal-message-2026-06-04",
      sourceName: "Portal message",
      kind: "note",
      capturedAt: "2026-06-04",
      content: "Patient asked about LDL follow-up.\nClinician suggested bringing the lipid panel."
    });
  });

  it("turns CSV rows into readable health-record lines", () => {
    const document = createDocumentFromCsv({
      sourceName: "Wearable export.csv",
      kind: "wearable",
      capturedAt: "2026-06-01",
      content: "date,steps,sleep_hours,resting_hr\n2026-05-30,7200,6.8,66\n2026-05-31,6400,6.4,68"
    });

    expect(document.id).toBe("wearable-export-csv-2026-06-01");
    expect(document.content).toContain("Row 1: date 2026-05-30; steps 7200; sleep hours 6.8; resting hr 66.");
    expect(document.content).toContain("Row 2: date 2026-05-31; steps 6400; sleep hours 6.4; resting hr 68.");
  });
});
