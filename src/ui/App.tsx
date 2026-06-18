import { useEffect, useMemo, useRef, useState } from "react";
import { answerHealthQuestion, type AnswerResult } from "../app/answerPipeline";
import { createHealthAiAdapter } from "../ai/adapterFactory";
import { chunkHealthDocument, normalizeHealthDocument, type HealthChunk, type HealthDocument, type HealthDocumentKind } from "../domain/documents";
import { createDocumentFromCsv, createDocumentFromText } from "../domain/importers";
import { retrieveRelevantChunks } from "../domain/retrieval";
import { classifyQuestionSafety } from "../domain/safety";
import "./App.css";

type WorkspaceMode = "demo" | "live";

interface DemoVault {
  id: string;
  label: string;
  summary: string;
  documents: HealthDocument[];
}

const liveVaultStorageKey = "healthvault-guardian-live-vault-v1";

const demoVaults: DemoVault[] = [
  {
    id: "cardio",
    label: "Cardio follow-up",
    summary: "Cholesterol, primary-care note, and wearable context.",
    documents: [
      normalizeHealthDocument({
        id: "lipids-2026-05",
        sourceName: "May lipid panel",
        kind: "lab",
        capturedAt: "2026-05-18",
        content:
          "Total cholesterol 219 mg/dL.\nLDL cholesterol 142 mg/dL.\nHDL cholesterol 51 mg/dL.\nTriglycerides 136 mg/dL.\nNon-HDL cholesterol 168 mg/dL."
      }),
      normalizeHealthDocument({
        id: "visit-note-2026-05",
        sourceName: "Primary care visit note",
        kind: "note",
        capturedAt: "2026-05-20",
        content:
          "Patient is preparing for a follow-up visit about cholesterol management.\nClinician recommended discussing diet, exercise, family history, and whether additional testing is appropriate.\nPatient prefers to try lifestyle changes before discussing medication options."
      }),
      normalizeHealthDocument({
        id: "wearable-2026-05",
        sourceName: "Wearable activity summary",
        kind: "wearable",
        capturedAt: "2026-05-31",
        content:
          "Average daily steps were 6,800.\nResting heart rate averaged 67 bpm.\nSleep averaged 6.7 hours per night.\nExercise minutes averaged 118 minutes per week."
      }),
      normalizeHealthDocument({
        id: "family-history-2026-05",
        sourceName: "Family history intake",
        kind: "note",
        capturedAt: "2026-05-20",
        content:
          "Father had a heart attack at age 58.\nMother has hypertension.\nPatient does not smoke and reports occasional alcohol use."
      })
    ]
  },
  {
    id: "fatigue",
    label: "Fatigue review",
    summary: "CBC, ferritin, sleep, and clinician note for visit prep.",
    documents: [
      normalizeHealthDocument({
        id: "cbc-2026-04",
        sourceName: "April CBC panel",
        kind: "lab",
        capturedAt: "2026-04-12",
        content:
          "Hemoglobin 12.1 g/dL.\nHematocrit 36.4%.\nMCV 79 fL.\nPlatelets 286 K/uL.\nWhite blood cell count 6.2 K/uL."
      }),
      normalizeHealthDocument({
        id: "iron-2026-04",
        sourceName: "Iron studies",
        kind: "lab",
        capturedAt: "2026-04-12",
        content:
          "Ferritin 18 ng/mL.\nSerum iron 61 ug/dL.\nTransferrin saturation 15%.\nClinician note says results should be discussed in clinical context."
      }),
      normalizeHealthDocument({
        id: "sleep-2026-04",
        sourceName: "Sleep wearable export",
        kind: "wearable",
        capturedAt: "2026-04-30",
        content:
          "Sleep averaged 6.1 hours per night.\nSleep schedule varied by more than 90 minutes on most weekends.\nResting heart rate averaged 72 bpm."
      }),
      normalizeHealthDocument({
        id: "fatigue-note-2026-05",
        sourceName: "Clinic message",
        kind: "note",
        capturedAt: "2026-05-02",
        content:
          "Patient reports afternoon fatigue and asks what to discuss at the next appointment.\nClinician suggested reviewing sleep, nutrition, menstrual history if relevant, and whether repeat labs are appropriate."
      })
    ]
  },
  {
    id: "insurance",
    label: "Care navigation",
    summary: "Insurance instruction, referral note, and appointment prep.",
    documents: [
      normalizeHealthDocument({
        id: "referral-2026-06",
        sourceName: "Specialist referral note",
        kind: "note",
        capturedAt: "2026-06-01",
        content:
          "Primary care clinician referred patient to cardiology for risk discussion.\nReferral reason: elevated LDL with family history.\nPatient should bring recent lipid panel and medication list."
      }),
      normalizeHealthDocument({
        id: "insurance-2026-06",
        sourceName: "Insurance prior-authorization guide",
        kind: "insurance",
        capturedAt: "2026-06-02",
        content:
          "Plan may require prior authorization for advanced lipid testing.\nDocumentation often includes recent lab values, family history, and clinician rationale.\nMember services phone number is listed on the insurance card."
      }),
      normalizeHealthDocument({
        id: "med-list-2026-06",
        sourceName: "Medication list",
        kind: "other",
        capturedAt: "2026-06-02",
        content:
          "Current medications: vitamin D supplement.\nNo cholesterol medication is listed.\nMedication allergies: none documented in this synthetic record."
      })
    ]
  }
];

const demoScenarios = [
  {
    id: "ldl",
    label: "LDL explanation",
    question: "Explain my LDL result and list questions I should ask my doctor.",
    intent: "Grounded patient education"
  },
  {
    id: "visit",
    label: "Visit prep",
    question: "Prepare a concise agenda for my cholesterol follow-up visit using my records.",
    intent: "Doctor-preparation workflow"
  },
  {
    id: "wearable",
    label: "Lifestyle context",
    question: "Use my wearable summary to suggest non-diagnostic topics to discuss at my visit.",
    intent: "Record-aware lifestyle context"
  },
  {
    id: "unsafe",
    label: "Safety block",
    question: "Diagnose me and tell me which cholesterol medication dose I should take.",
    intent: "Safety gate demonstration"
  }
];

const liveScenarios = [
  {
    id: "live-summary",
    label: "Summarize vault",
    question: "Summarize my imported records and prepare questions for my next doctor visit.",
    intent: "Turn raw imports into a visit brief"
  },
  {
    id: "live-follow-up",
    label: "Follow-up prep",
    question: "What should I clarify with my clinician based only on the records I imported?",
    intent: "Doctor-preparation workflow"
  },
  {
    id: "live-citations",
    label: "Find evidence",
    question: "Which imported records are most relevant to my question, and what do they say?",
    intent: "Citation and retrieval check"
  },
  {
    id: "live-safety",
    label: "Safety boundary",
    question: "Diagnose me from these records and tell me what medication dose to take.",
    intent: "Unsafe request handling"
  }
];

const readinessItems = ["Live vault", "QVAC local inference", "RAG citations", "Safety gate", "No cloud AI", "Exportable evidence"];

export function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<WorkspaceMode>("demo");
  const [selectedVaultId, setSelectedVaultId] = useState(demoVaults[0].id);
  const [liveDocuments, setLiveDocuments] = useState<HealthDocument[]>(() => loadLiveVault());
  const [draftSourceName, setDraftSourceName] = useState("Portal note");
  const [draftKind, setDraftKind] = useState<HealthDocumentKind>("note");
  const [draftCapturedAt, setDraftCapturedAt] = useState(new Date().toISOString().slice(0, 10));
  const [draftContent, setDraftContent] = useState("");
  const [question, setQuestion] = useState(demoScenarios[0].question);
  const [selectedScenario, setSelectedScenario] = useState(demoScenarios[0].id);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const selectedVault = demoVaults.find((vault) => vault.id === selectedVaultId) ?? demoVaults[0];
  const documents = mode === "demo" ? selectedVault.documents : liveDocuments;
  const chunks = useMemo<HealthChunk[]>(
    () => documents.flatMap((document) => chunkHealthDocument(document, { maxChars: 220 })),
    [documents]
  );
  const adapterBundle = useMemo(
    () =>
      createHealthAiAdapter({
        adapterMode: import.meta.env.VITE_AI_ADAPTER
      }),
    []
  );
  const safety = useMemo(() => classifyQuestionSafety(question), [question]);
  const retrievalTrace = useMemo(() => retrieveRelevantChunks(chunks, question, 4), [chunks, question]);
  const latestEvidence = result?.evidence[0] ?? null;
  const citedChunkIds = new Set(result?.citations.map((citation) => citation.chunkId) ?? []);
  const activeVaultLabel = mode === "demo" ? selectedVault.label : "Live private vault";
  const hasDocuments = documents.length > 0;

  useEffect(() => {
    localStorage.setItem(liveVaultStorageKey, JSON.stringify(liveDocuments));
  }, [liveDocuments]);

  useEffect(() => {
    return () => {
      void adapterBundle.unload?.();
    };
  }, [adapterBundle]);

  async function askQuestion() {
    if (!hasDocuments) {
      setError("Import at least one record before asking in Live mode.");
      return;
    }

    setIsWorking(true);
    setError(null);

    try {
      const nextResult = await answerHealthQuestion({
        question,
        chunks,
        adapter: adapterBundle.adapter
      });
      setResult(nextResult);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The local adapter failed to answer.";
      setError(message);
    } finally {
      setIsWorking(false);
    }
  }

  function changeMode(nextMode: WorkspaceMode) {
    setMode(nextMode);
    setResult(null);
    setError(null);
    setImportMessage(null);
    setSelectedScenario(nextMode === "demo" ? selectedScenario || demoScenarios[0].id : "");
    if (nextMode === "live" && question === demoScenarios[0].question) {
      setQuestion("Summarize my imported records and prepare questions for my next doctor visit.");
    }
  }

  function chooseScenario(id: string) {
    const scenario = demoScenarios.find((item) => item.id === id);
    if (!scenario) return;
    setMode("demo");
    setSelectedScenario(id);
    setQuestion(scenario.question);
    setResult(null);
    setError(null);
  }

  function chooseLiveScenario(id: string) {
    const scenario = liveScenarios.find((item) => item.id === id);
    if (!scenario) return;
    setMode("live");
    setSelectedScenario(id);
    setQuestion(scenario.question);
    setResult(null);
    setError(null);
  }

  function chooseVault(id: string) {
    setSelectedVaultId(id);
    setResult(null);
    setError(null);
  }

  function importPastedRecord() {
    if (!draftContent.trim()) {
      setImportMessage("Paste a record before importing.");
      return;
    }

    const document = createDocumentFromText({
      sourceName: draftSourceName,
      kind: draftKind,
      capturedAt: draftCapturedAt,
      content: draftContent
    });
    addLiveDocument(document);
    setDraftContent("");
    setImportMessage(`Imported ${document.sourceName}.`);
  }

  async function importFiles(files: FileList | null) {
    if (!files?.length) return;

    const imported: HealthDocument[] = [];
    for (const file of Array.from(files)) {
      const content = await file.text();
      const extension = file.name.split(".").pop()?.toLowerCase();
      const kind = inferKind(file.name);
      imported.push(
        extension === "csv"
          ? createDocumentFromCsv({ sourceName: file.name, kind, capturedAt: draftCapturedAt, content })
          : createDocumentFromText({ sourceName: file.name, kind, capturedAt: draftCapturedAt, content })
      );
    }

    setLiveDocuments((current) => [...imported, ...current]);
    setMode("live");
    setResult(null);
    setError(null);
    setImportMessage(`Imported ${imported.length} file${imported.length === 1 ? "" : "s"}.`);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function addLiveDocument(document: HealthDocument) {
    setLiveDocuments((current) => [document, ...current.filter((item) => item.id !== document.id)]);
    setMode("live");
    setResult(null);
    setError(null);
  }

  function removeLiveDocument(id: string) {
    setLiveDocuments((current) => current.filter((document) => document.id !== id));
    setResult(null);
  }

  function clearLiveVault() {
    setLiveDocuments([]);
    setResult(null);
    setError(null);
    setImportMessage("Live vault cleared.");
  }

  function exportEvidence() {
    const payload = {
      app: "HealthVault Guardian",
      mode,
      vault: activeVaultLabel,
      adapter: adapterBundle.label,
      question,
      safety,
      documents: documents.map(({ id, sourceName, kind, capturedAt }) => ({ id, sourceName, kind, capturedAt })),
      citations: result?.citations ?? [],
      evidence: result?.evidence ?? [],
      remoteApis: []
    };
    downloadText("healthvault-guardian-evidence.json", JSON.stringify(payload, null, 2), "application/json");
  }

  function exportVisitPack() {
    const citationText =
      result?.citations.map((citation) => `- ${citation.sourceName} (${citation.chunkId}): ${citation.text}`).join("\n") ??
      "- No citations generated yet.";
    const evidenceText = latestEvidence
      ? `- Model: ${latestEvidence.model}\n- Adapter: ${latestEvidence.adapterMode}\n- TTFT: ${latestEvidence.ttftMs} ms\n- Tokens/sec: ${latestEvidence.tokensPerSecond.toFixed(1)}\n- Prompt hash: ${latestEvidence.promptHash}`
      : "- No inference evidence generated yet.";
    const markdown = `# HealthVault Guardian Visit Pack

## Mode

${mode === "demo" ? "Demo mode" : "Live mode"}

## Question

${question}

## Answer

${result?.answer ?? "Run a local answer before exporting the final visit pack."}

## Citations

${citationText}

## Local Inference Evidence

${evidenceText}

## Safety Note

This is patient education and visit preparation, not diagnosis, prescription, emergency triage, or a replacement for a qualified clinician.
`;
    downloadText("healthvault-guardian-visit-pack.md", markdown, "text/markdown");
  }

  return (
    <main className="app-shell">
      <aside className="nav-rail">
        <div className="brand-mark">
          <span>HV</span>
          <div>
            <strong>HealthVault</strong>
            <small>Local MedPsy workspace</small>
          </div>
        </div>

        <div className="mode-toggle" aria-label="Workspace mode">
          <button className={mode === "demo" ? "active" : ""} onClick={() => changeMode("demo")} type="button">
            Demo
          </button>
          <button className={mode === "live" ? "active" : ""} onClick={() => changeMode("live")} type="button">
            Live
          </button>
        </div>

        <div className="nav-stat">
          <span>Active vault</span>
          <strong>{activeVaultLabel}</strong>
          <small>{documents.length} records / {chunks.length} chunks</small>
        </div>

        <div className="nav-stat">
          <span>Runtime</span>
          <strong>{adapterBundle.label}</strong>
          <small>0 cloud AI APIs declared</small>
        </div>

        <div className="readiness-list">
          {readinessItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </aside>

      <section className="workspace-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">QVAC Hackathon I / General Purpose + MedPsy</p>
            <h1>{mode === "demo" ? "Judge-ready demo console" : "Live private health workspace"}</h1>
          </div>
          <div className="topbar-actions">
            <button className="ghost-action" disabled={!result} onClick={exportVisitPack} type="button">
              Export visit pack
            </button>
            <button className="ghost-action" disabled={!result} onClick={exportEvidence} type="button">
              Export evidence
            </button>
          </div>
        </header>

        <section className="workspace-grid">
          <aside className="vault-column">
            {mode === "demo" ? (
              <DemoVaultPanel
                documents={documents}
                selectedVaultId={selectedVaultId}
                selectedVault={selectedVault}
                onChooseVault={chooseVault}
              />
            ) : (
              <LiveVaultPanel
                documents={liveDocuments}
                draftSourceName={draftSourceName}
                draftKind={draftKind}
                draftCapturedAt={draftCapturedAt}
                draftContent={draftContent}
                importMessage={importMessage}
                fileInputRef={fileInputRef}
                onSourceNameChange={setDraftSourceName}
                onKindChange={setDraftKind}
                onCapturedAtChange={setDraftCapturedAt}
                onContentChange={setDraftContent}
                onImportPaste={importPastedRecord}
                onImportFiles={importFiles}
                onRemoveDocument={removeLiveDocument}
                onClearVault={clearLiveVault}
              />
            )}
          </aside>

          <section className="chat-column">
            <section className="surface-panel assistant-panel">
              <div className="assistant-command">
              <ScenarioDock
                mode={mode}
                selectedScenario={selectedScenario}
                onChooseDemoScenario={chooseScenario}
                onChooseLiveScenario={chooseLiveScenario}
              />
              <div className="section-heading inline">
                <div>
                  <p className="eyebrow">Ask locally</p>
                  <h2>{mode === "demo" ? "Run a curated scenario" : "Ask your imported vault"}</h2>
                </div>
                <span className={safety.allowed ? "safety-pill allowed" : "safety-pill blocked"}>
                  {safety.allowed ? "Safety allowed" : "Safety blocked"}
                </span>
              </div>
              <textarea
                aria-label="Health-record question"
                value={question}
                onChange={(event) => {
                  setQuestion(event.target.value);
                  setSelectedScenario("");
                }}
              />
              <div className="controls">
                <button className="primary-action" disabled={isWorking || !question.trim() || !hasDocuments} onClick={askQuestion}>
                  {isWorking ? "Running local inference" : mode === "demo" ? "Run demo" : "Ask live vault"}
                </button>
                <span className="inline-status">{hasDocuments ? `${chunks.length} local chunks ready` : "Import records to begin"}</span>
              </div>
              {!safety.allowed ? <p className="policy-note">{safety.message}</p> : null}
              {error ? <p className="policy-note">{error}</p> : null}
              </div>

              <div className={result?.status === "blocked" ? "answer-surface blocked-answer" : "answer-surface"}>
              <div className="section-heading inline">
                <div>
                  <p className="eyebrow">Patient-facing output</p>
                  <h2>{result ? (result.status === "blocked" ? "Safety response" : "Grounded answer") : "Waiting for a local run"}</h2>
                </div>
                {latestEvidence ? <span className="evidence-chip">{latestEvidence.tokensPerSecond.toFixed(1)} tok/s</span> : null}
              </div>
              {result ? <AnswerText answer={result.answer} /> : <p className="empty-state">Import records or choose a demo scenario, then run local inference to produce a cited answer.</p>}
              </div>
            </section>
          </section>

          <aside className="evidence-column">
            <section className="surface-panel evidence-panel">
              <RuntimePanel adapterLabel={adapterBundle.label} evidence={latestEvidence} />
              <RagTracePanel retrievalTrace={retrievalTrace} citedChunkIds={citedChunkIds} />
              <ChecklistPanel mode={mode} result={result} latestEvidence={latestEvidence} documents={documents} />
            </section>
          </aside>
        </section>
      </section>
    </main>
  );
}

function DemoVaultPanel({
  documents,
  selectedVaultId,
  selectedVault,
  onChooseVault
}: {
  documents: HealthDocument[];
  selectedVaultId: string;
  selectedVault: DemoVault;
  onChooseVault: (id: string) => void;
}) {
  return (
    <>
      <section className="surface-panel">
        <div className="section-heading">
          <p className="eyebrow">Synthetic vault</p>
          <h2>{selectedVault.label}</h2>
        </div>
        <div className="vault-switcher" aria-label="Synthetic vault selector">
          {demoVaults.map((vault) => (
            <button
              className={vault.id === selectedVaultId ? "vault-tab active" : "vault-tab"}
              key={vault.id}
              onClick={() => onChooseVault(vault.id)}
              type="button"
            >
              <span>{vault.label}</span>
              <small>{vault.documents.length} records</small>
            </button>
          ))}
        </div>
        <p className="vault-summary">{selectedVault.summary}</p>
        <RecordList documents={documents} removable={false} />
      </section>
    </>
  );
}

function LiveVaultPanel({
  documents,
  draftSourceName,
  draftKind,
  draftCapturedAt,
  draftContent,
  importMessage,
  fileInputRef,
  onSourceNameChange,
  onKindChange,
  onCapturedAtChange,
  onContentChange,
  onImportPaste,
  onImportFiles,
  onRemoveDocument,
  onClearVault
}: {
  documents: HealthDocument[];
  draftSourceName: string;
  draftKind: HealthDocumentKind;
  draftCapturedAt: string;
  draftContent: string;
  importMessage: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onSourceNameChange: (value: string) => void;
  onKindChange: (value: HealthDocumentKind) => void;
  onCapturedAtChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onImportPaste: () => void;
  onImportFiles: (files: FileList | null) => void;
  onRemoveDocument: (id: string) => void;
  onClearVault: () => void;
}) {
  return (
    <section className="surface-panel vault-panel import-panel">
      <div className="vault-section">
        <div className="section-heading">
          <p className="eyebrow">Live mode</p>
          <h2>Import private records</h2>
        </div>
        <div className="import-grid">
          <label>
            <span>Source</span>
            <input value={draftSourceName} onChange={(event) => onSourceNameChange(event.target.value)} />
          </label>
          <label>
            <span>Type</span>
            <select value={draftKind} onChange={(event) => onKindChange(event.target.value as HealthDocumentKind)}>
              <option value="note">Note</option>
              <option value="lab">Lab</option>
              <option value="wearable">Wearable</option>
              <option value="insurance">Insurance</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            <span>Date</span>
            <input value={draftCapturedAt} onChange={(event) => onCapturedAtChange(event.target.value)} type="date" />
          </label>
        </div>
        <textarea
          className="import-textarea"
          placeholder="Paste a lab result, visit note, wearable summary, insurance instruction, or care message."
          value={draftContent}
          onChange={(event) => onContentChange(event.target.value)}
        />
        <div className="controls">
          <button className="primary-action" onClick={onImportPaste} type="button">
            Add pasted record
          </button>
          <button className="ghost-action" onClick={() => fileInputRef.current?.click()} type="button">
            Upload TXT / CSV
          </button>
          <input
            ref={fileInputRef}
            accept=".txt,.csv,text/plain,text/csv"
            className="hidden-input"
            multiple
            onChange={(event) => void onImportFiles(event.target.files)}
            type="file"
          />
        </div>
        {importMessage ? <p className="import-message">{importMessage}</p> : null}
      </div>

      <div className="vault-section vault-records-section">
        <div className="section-heading inline">
          <div>
            <p className="eyebrow">Live vault</p>
            <h2>{documents.length ? `${documents.length} imported records` : "No records yet"}</h2>
          </div>
          <button className="text-action" disabled={!documents.length} onClick={onClearVault} type="button">
            Clear
          </button>
        </div>
        {documents.length ? (
          <RecordList documents={documents} onRemoveDocument={onRemoveDocument} removable />
        ) : (
          <p className="empty-state small">Import a record to build a private local vault. Records stay in browser local storage.</p>
        )}
      </div>
    </section>
  );
}

function ScenarioDock({
  mode,
  selectedScenario,
  onChooseDemoScenario,
  onChooseLiveScenario
}: {
  mode: WorkspaceMode;
  selectedScenario: string;
  onChooseDemoScenario: (id: string) => void;
  onChooseLiveScenario: (id: string) => void;
}) {
  const scenarios = mode === "demo" ? demoScenarios : liveScenarios;
  const choose = mode === "demo" ? onChooseDemoScenario : onChooseLiveScenario;

  return (
    <div className="scenario-dock" aria-label={`${mode} scenario shortcuts`}>
      <div>
        <p className="eyebrow">{mode === "demo" ? "Demo scenarios" : "Live scenarios"}</p>
        <h2>{mode === "demo" ? "Pick a judging moment" : "Start from a real workflow"}</h2>
      </div>
      <div className="scenario-chips">
        {scenarios.map((scenario) => (
          <button
            className={scenario.id === selectedScenario ? "scenario-chip active" : "scenario-chip"}
            key={scenario.id}
            onClick={() => choose(scenario.id)}
            type="button"
          >
            <span>{scenario.label}</span>
            <small>{scenario.intent}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function RecordList({
  documents,
  removable,
  onRemoveDocument
}: {
  documents: HealthDocument[];
  removable: boolean;
  onRemoveDocument?: (id: string) => void;
}) {
  return (
    <div className="record-list">
      {documents.map((document) => (
        <article className="record" key={document.id}>
          <div>
            <span>{document.kind}</span>
            <time>{document.capturedAt ?? "undated"}</time>
          </div>
          <h3>{document.sourceName}</h3>
          <ul>
            {document.content
              .split("\n")
              .slice(0, 3)
              .map((line) => (
                <li key={line}>{line}</li>
              ))}
          </ul>
          {removable ? (
            <button className="text-action danger" onClick={() => onRemoveDocument?.(document.id)} type="button">
              Remove
            </button>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function RuntimePanel({ adapterLabel, evidence }: { adapterLabel: string; evidence: AnswerResult["evidence"][number] | null }) {
  return (
    <section className="evidence-section">
      <div className="section-heading">
        <p className="eyebrow">QVAC runtime</p>
        <h2>Inference evidence</h2>
      </div>
      <dl className="metrics-grid">
        <Metric label="Model" value={evidence?.model ?? "MedPsy local runtime"} />
        <Metric label="Adapter" value={evidence?.adapterMode ?? adapterLabel} />
        <Metric label="TTFT" value={evidence ? `${evidence.ttftMs} ms` : "waiting"} />
        <Metric label="Prompt hash" value={evidence?.promptHash.slice(0, 12) ?? "not generated"} />
        <Metric label="Input tokens" value={String(evidence?.inputTokens ?? "-")} />
        <Metric label="Output tokens" value={String(evidence?.outputTokens ?? "-")} />
      </dl>
    </section>
  );
}

function RagTracePanel({
  retrievalTrace,
  citedChunkIds
}: {
  retrievalTrace: ReturnType<typeof retrieveRelevantChunks>;
  citedChunkIds: Set<string>;
}) {
  return (
    <section className="evidence-section rag-section">
      <div className="section-heading">
        <p className="eyebrow">RAG trace</p>
        <h2>Retrieved evidence</h2>
      </div>
      <div className="trace-list">
        {retrievalTrace.map((item) => (
          <article className={citedChunkIds.has(item.chunk.id) ? "trace cited" : "trace"} key={item.chunk.id}>
            <div>
              <strong>{item.chunk.sourceName}</strong>
              <span>{item.score.toFixed(2)}</span>
            </div>
            <p>{item.chunk.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ChecklistPanel({
  mode,
  result,
  latestEvidence,
  documents
}: {
  mode: WorkspaceMode;
  result: AnswerResult | null;
  latestEvidence: AnswerResult["evidence"][number] | null;
  documents: HealthDocument[];
}) {
  return (
    <section className="evidence-section">
      <div className="section-heading">
        <p className="eyebrow">Readiness</p>
        <h2>{mode === "demo" ? "Judge checklist" : "Product workflow"}</h2>
      </div>
      <ul className="checklist">
        <li className={documents.length ? "done" : ""}>Local records loaded</li>
        <li className={result ? "done" : ""}>Local answer generated</li>
        <li className={latestEvidence ? "done" : ""}>Inference metrics available</li>
        <li className={result?.citations.length ? "done" : ""}>Citations mapped to records</li>
        <li className="done">Remote API manifest: none</li>
      </ul>
    </section>
  );
}

function AnswerText({ answer }: { answer: string }) {
  const paragraphs = answer
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="answer-copy">
      {paragraphs.map((paragraph, index) => (
        <p key={`${paragraph}-${index}`}>{paragraph}</p>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function loadLiveVault(): HealthDocument[] {
  try {
    const raw = localStorage.getItem(liveVaultStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HealthDocument[];
    return Array.isArray(parsed) ? parsed.map(normalizeHealthDocument) : [];
  } catch {
    return [];
  }
}

function inferKind(fileName: string): HealthDocumentKind {
  const lower = fileName.toLowerCase();
  if (lower.includes("lab") || lower.includes("lipid") || lower.includes("cbc") || lower.includes("blood")) return "lab";
  if (lower.includes("wearable") || lower.includes("sleep") || lower.includes("steps")) return "wearable";
  if (lower.includes("insurance") || lower.includes("prior")) return "insurance";
  return "note";
}

function downloadText(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
