# HealthVault Guardian

HealthVault Guardian is a local-first health-record assistant. It helps users import private health records, ask education-focused questions, review record-grounded citations, and export visit-preparation evidence without sending records to a cloud AI service.

The app is built for local QVAC MedPsy inference, with a deterministic local demo adapter available for UI smoke testing and development.

## What It Does

- Imports health records from pasted text, TXT files, or CSV files.
- Builds a browser-local private vault from the imported records.
- Runs simple local retrieval over the vault and shows the retrieved evidence.
- Answers patient-education and doctor-visit-preparation questions.
- Shows citations mapped back to local records.
- Blocks diagnosis, medication-dose, emergency, and clinician-replacement prompts before AI inference.
- Exports a visit pack and structured evidence JSON for inspection.

## App Modes

### Demo Mode

Demo mode uses built-in synthetic records. It is useful for trying the product immediately after install, without preparing files.

Included demo vaults:

- Cardio follow-up
- Fatigue review
- Care navigation

### Live Mode

Live mode is the private workspace. Users can paste records or upload TXT/CSV files. Imported records are kept in browser local storage for the local app session.

Use only synthetic or consented records when sharing screenshots, videos, or public demos.

## Architecture

```text
Browser UI
  - React workspace
  - demo vaults and live vault
  - local storage for imported records
  - citation and evidence panels

Application logic
  - document normalization and chunking
  - keyword retrieval
  - safety classification
  - answer pipeline

AI adapters
  - localDemoAdapter for deterministic development output
  - RemoteQvacAdapter in the browser
  - QvacAdapter in the Vite Node server
  - @qvac/sdk loadModel / completion / unloadModel
```

The browser calls `POST /api/qvac/complete` when `VITE_AI_ADAPTER=qvac` is enabled. The Vite dev server handles that endpoint and calls the local QVAC SDK runtime.

## Requirements

- Node.js 22 or newer recommended.
- npm.
- macOS, Linux, or Windows supported by the installed QVAC/Bare runtime packages.
- For QVAC mode: a local MedPsy GGUF model file or a QVAC model source that `@qvac/sdk` can resolve.

The repository does not commit model files. Keep local models under `models/` or another local path; `models/` is ignored by git.

## Install

Clone the repository and install dependencies:

```bash
git clone https://github.com/jj5437/healthvault-guardian.git
cd healthvault-guardian
npm install
```

Run the test suite:

```bash
npm test -- --run
```

Start the development server:

```bash
npm run dev
```

Open the Vite URL printed in the terminal, usually:

```text
http://127.0.0.1:5173
```

With no extra environment variables, the UI uses the deterministic local demo adapter. This is enough to explore the interface, imports, retrieval, citations, safety behavior, and exports.

## Configure QVAC MedPsy

Create a local environment file:

```bash
cp .env.example .env.local
```

Edit `.env.local` and set the adapter plus model source:

```bash
VITE_AI_ADAPTER=qvac
VITE_QVAC_MODEL_NAME=qvac/MedPsy-1.7B-GGUF
VITE_QVAC_MODEL_SRC=/absolute/path/to/medpsy.gguf
VITE_QVAC_PREDICT_TOKENS=1024
```

`VITE_QVAC_MODEL_SRC` must be a real local file path or another source accepted by `@qvac/sdk`. Do not leave it as `/absolute/path/to/medpsy.gguf`; the app intentionally rejects that placeholder.

Start QVAC mode:

```bash
npm run dev
```

Then open:

```text
http://127.0.0.1:5173
```

The left rail should show:

```text
Adapter: QVAC MedPsy local runtime
```

## Download A Local GGUF Model

If you already have the MedPsy GGUF file, place it anywhere local and point `VITE_QVAC_MODEL_SRC` at it.

One common layout is:

```bash
mkdir -p models
```

If the model is available from Hugging Face, install the Hugging Face CLI and download it into `models/`:

```bash
python3 -m pip install -U "huggingface_hub[cli]"
huggingface-cli download qvac/MedPsy-1.7B-GGUF \
  --local-dir models/MedPsy-1.7B-GGUF \
  --local-dir-use-symlinks False
```

After download, find the GGUF file:

```bash
find models/MedPsy-1.7B-GGUF -name "*.gguf" -print
```

Then set `.env.local` to that exact file path:

```bash
VITE_AI_ADAPTER=qvac
VITE_QVAC_MODEL_NAME=qvac/MedPsy-1.7B-GGUF
VITE_QVAC_MODEL_SRC=/absolute/path/to/healthvault-guardian/models/MedPsy-1.7B-GGUF/<file>.gguf
VITE_QVAC_PREDICT_TOKENS=1024
```

Alternatively, if your QVAC SDK installation can resolve the model by registry name, omit `VITE_QVAC_MODEL_SRC` and keep only:

```bash
VITE_AI_ADAPTER=qvac
VITE_QVAC_MODEL_NAME=qvac/MedPsy-1.7B-GGUF
VITE_QVAC_PREDICT_TOKENS=1024
```

You can also ask the QVAC SDK to pre-cache a model source before starting the app:

```bash
node -e "import('@qvac/sdk').then(({ downloadAsset }) => downloadAsset({ assetSrc: 'qvac/MedPsy-1.7B-GGUF' }))"
```

If that command cannot resolve the model source in your local QVAC SDK setup, use the Hugging Face/local GGUF path flow above.

## Verify QVAC Setup

Confirm the SDK imports correctly:

```bash
node -e "import('@qvac/sdk').then(m => console.log(['loadModel','completion','unloadModel'].every(k => k in m)))"
```

Expected output:

```text
true
```

With the dev server running in QVAC mode, open the app and run a demo question. A successful QVAC response should populate the inference panel with:

- model name
- adapter mode
- time to first token
- prompt hash
- input token count
- output token count
- tokens per second

## Use The App

### Try The Built-In Demo

1. Start the app.
2. Stay in `Demo` mode.
3. Choose a synthetic vault.
4. Choose a scenario such as `LDL explanation`.
5. Click `Run demo`.
6. Review the answer, citations, retrieval trace, and inference evidence.

### Import Local Records

1. Switch to `Live` mode.
2. Paste a record and click `Add pasted record`, or click `Upload TXT / CSV`.
3. Choose a live scenario, or type your own question.
4. Click `Ask live vault`.
5. Review the cited answer and retrieved evidence.

### Export Results

After a successful run:

- `Export visit pack` downloads a Markdown visit-preparation summary.
- `Export evidence` downloads a JSON evidence payload with safety status, citations, adapter label, and inference metrics.

## Safety Boundary

HealthVault Guardian is for patient education and clinician-visit preparation. It is not a diagnosis, prescription, or emergency triage system.

Blocked requests include:

- diagnosis requests
- medication dose instructions
- prescription changes
- emergency triage
- requests to replace a qualified clinician

Allowed requests include:

- explaining records in plain language
- summarizing imported records
- preparing questions for a doctor visit
- finding which records support an answer

## Development Commands

Install dependencies:

```bash
npm install
```

Run tests once:

```bash
npm test -- --run
```

Run tests in watch mode:

```bash
npm run test:watch
```

Start local development:

```bash
npm run dev
```

Build production assets:

```bash
npm run build
```

## Project Structure

```text
src/
  ai/
    adapterFactory.ts
    localDemoAdapter.ts
    qvacAdapter.ts
    qvacConfig.ts
    remoteQvacAdapter.ts
    types.ts
  app/
    answerPipeline.ts
  domain/
    documents.ts
    evidence.ts
    importers.ts
    retrieval.ts
    safety.ts
  ui/
    App.tsx
    App.css
tests/
evidence/
```

## Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_AI_ADAPTER` | local demo adapter | Set to `qvac` to use QVAC inference. |
| `VITE_QVAC_MODEL_NAME` | `qvac/MedPsy-1.7B-GGUF` | Model name recorded in evidence and used when no model source is provided. |
| `VITE_QVAC_MODEL_SRC` | unset | Local GGUF path or QVAC-resolvable model source. |
| `VITE_QVAC_PREDICT_TOKENS` | `1024` | Generation token budget passed to QVAC. |

## Privacy Notes

- Imported Live mode records stay in browser local storage.
- The project does not require cloud AI APIs.
- Model files and `.env.local` are ignored by git.
- Do not commit real health records, private screenshots, or local model artifacts.
