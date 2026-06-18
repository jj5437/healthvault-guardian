# HealthVault Guardian

HealthVault Guardian is a local-first health-record education assistant for QVAC Hackathon I. It helps people understand private health records without sending those records to cloud AI services. The app combines local document ingestion, local RAG, safety gating, record citations, QVAC MedPsy inference, and exportable evidence.

The current implementation includes a polished demo console, a live private vault, deterministic tests, and a QVAC SDK adapter boundary in `src/ai/qvacAdapter.ts`. The project declares `@qvac/sdk@0.12.1`; judged AI workloads should use `QvacAdapter` with a local MedPsy model source.

## Judge Summary

- Problem: health records are sensitive, but most AI health assistants require cloud upload.
- Solution: a browser-local workspace for importing records, asking education-focused questions, seeing grounded citations, and exporting run evidence.
- QVAC fit: all judged AI inference runs through `@qvac/sdk` with a local MedPsy model; no cloud AI APIs are used.
- Tracks: General Purpose and Our Psy Models.
- Hardware target: MacBook Pro with Apple M4, 16 GB memory.
- Demo promise: disconnect network, import or select records, ask a question, show local QVAC evidence, export a visit pack, then show an unsafe request being blocked.
- Safety boundary: patient education and visit preparation only; no diagnosis, emergency triage, prescription changes, or clinician replacement.

## Hackathon Positioning

- Target tracks: General Purpose and Our Psy Models.
- Hardware target: MacBook Pro with Apple M4, 16 GB memory.
- Product scope: patient education and doctor visit preparation.
- Non-goals: diagnosis, emergency triage, prescription changes, or replacing clinicians.

## Current Readiness

Strong enough for an internal demo today, but not final until the QVAC run and submission evidence are refreshed.

Ready:

- Live/demo UI with record import, synthetic health vaults, scenario shortcuts, citations, safety block, and evidence export.
- Local retrieval and safety policy covered by tests.
- QVAC adapter boundary with model load, completion, unload, prompt hash, token, TTFT, tokens/sec, and duration evidence.
- QVAC local smoke test passed on June 6, 2026 through `/api/qvac/complete` with `adapterMode=qvac`.
- Remote API manifest declares zero remote/cloud AI APIs.
- Build and test commands pass locally.

Remaining before prize submission:

- Record the final demo with `VITE_AI_ADAPTER=qvac` and the local MedPsy GGUF path.
- Replace `evidence/*.example.json` with fresh `hardware.json`, `demo-run.json`, `model-lifecycle.jsonl`, and `inference.jsonl`.
- Add hardware screenshots or `system_profiler` output to the public repository.
- Publish a public GitHub repository with this Apache 2.0 license and submit the demo video link.

## Run Locally

```bash
npm install
npm test -- --run
npm run dev
```

Open the local URL printed by Vite.

By default the UI uses the deterministic local demo adapter. To run the UI against QVAC MedPsy, start the Vite dev server with a local model source. The browser calls `/api/qvac/complete`, and the Vite Node process calls `@qvac/sdk` locally.

```bash
VITE_AI_ADAPTER=qvac \
VITE_QVAC_MODEL_NAME=qvac/MedPsy-1.7B-GGUF \
VITE_QVAC_MODEL_SRC=/absolute/path/to/medpsy.gguf \
npm run dev
```

## Build

```bash
npm run build
```

## QVAC Integration

The required SDK is declared in `package.json`:

```bash
npm install @qvac/sdk@0.12.1
```

`QvacAdapter` now owns the local model lifecycle boundary:

- lazily loads MedPsy with `loadModel`;
- sends a grounded JSON-only patient-education prompt through `completion`;
- captures prompt hash, token counts, TTFT, tokens/sec, and duration as inference evidence;
- unloads the model with `unload()`.

Before a judged demo, confirm the SDK can be imported and point the adapter at the local MedPsy model source:

```bash
node -e "import('@qvac/sdk').then(m => console.log(['loadModel','completion','unloadModel'].every(k => k in m)))"
```

The deterministic `localDemoAdapter` remains for tests and UI smoke demos only; it is not acceptable for final AI workloads.

Verified QVAC smoke test on June 6, 2026:

- Endpoint: `POST /api/qvac/complete`
- Model: `qvac/MedPsy-1.7B-GGUF`
- Adapter mode: `qvac`
- Input tokens: 236
- Output tokens: 717
- TTFT: 583.27 ms
- Throughput: 59.58 tokens/sec
- Duration: 12,797 ms
- Prompt hash: `5feb9295ad122d050af22a6826a92ac83e00a0463f61406fd355f3aad7159cb7`

## Evidence Bundle

Submission evidence lives under `evidence/`. The example files document the expected schema; final judged evidence should use non-example names:

- `remote-apis.json`: remote API disclosure.
- `hardware.example.json`: hardware profile example.
- `demo-run.example.json`: standard run summary example.
- `model-lifecycle.jsonl`: model load/unload events.
- `inference.jsonl`: prompt hash, tokens, TTFT, tokens/sec, and duration per inference.

Recommended final structure:

```text
evidence/
  README.md
  remote-apis.json
  hardware.json
  demo-run.json
  model-lifecycle.jsonl
  inference.jsonl
  screenshots/
    system-profiler.png
    demo-console.png
    exported-evidence.png
```

## Demo Script

The full recording plan is in `docs/demo-video-plan.md`. The short version:

1. Open with the privacy problem and QVAC requirement.
2. Show the local runtime configuration and hardware.
3. Run the demo vault question and point at citations plus inference metrics.
4. Switch to Live mode, import a synthetic record, and ask a visit-prep question.
5. Export the visit pack and evidence JSON.
6. Trigger the unsafe medication/diagnosis prompt and show the safety block.
7. Close with zero cloud AI APIs and the evidence bundle.

## Safety Boundary

The app blocks emergency, diagnosis, prescription-change, and clinician-replacement prompts before calling the AI adapter. Allowed prompts focus on education, summarization, local record explanation, and questions to discuss with a qualified professional.

## Submission Docs

- `SUBMISSION.md`: DoraHacks submission copy.
- `docs/judge-readiness.md`: prize-readiness assessment and remaining risks.
- `docs/demo-video-plan.md`: 5-minute demo recording plan.
- `evidence/README.md`: final evidence collection procedure.
