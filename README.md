# SETU

A talking symptom-history assistant for primary care clinics in India. The patient picks Bengali,
Hindi or English and a voice, then answers the clinic's own history questions by speaking or
tapping on a phone. At the end the doctor gets:

1. **Coded complaints**: each complaint the patient reported, with a WHO ICD-10 (and later SNOMED CT)
   code, labelled *patient-reported, not a diagnosis*.
2. **A one-page summary**: red flags first, then history of each complaint, past medical history
   and personal history.

Everything runs on one PC in the clinic with open-source models. Nothing is sent to a cloud service.

> **Status: development.** All red-flag rules, ICD codes, past-history questions and translations are
> drafts. Do not use with patients until clinicians have signed them off (see `content/README.md`).

## How it fits together

```
Phone (PWA)  ──HTTPS──▶  Caddy  ──▶  Server (Node)  ──▶  Engine (rules, no AI)
  speaks questions            │          │                    └─ question bank (from the spreadsheets)
  records answers             │          ├──▶ Speech service (IndicConformer)  audio → text
                              │          └──▶ Local LLM (Qwen 3.5 9B)          text → one of the allowed answers
                              └─ pre-recorded question audio (Indic Parler-TTS)
```

The rules engine decides every question and every red flag. The AI only does two narrow jobs:
turning speech into text, and matching what was said to one of the answers the clinicians wrote.
The patient always confirms what the app understood. See [docs/architecture.md](docs/architecture.md).

## Repository map

| Folder | What it is | Language |
| --- | --- | --- |
| `content/` | The clinical content: your spreadsheets, red flags, codes, past history. **Start here.** | xlsx, YAML |
| `packages/bank` | The format of the compiled question bank (the contract between all parts) | TypeScript |
| `packages/bank-compiler` | Reads the spreadsheets and YAML, checks them, writes `content/bank/bank.json` and a report | TypeScript |
| `packages/engine` | The interview: next question, linked complaints, red flags, notes, doctor summary | TypeScript |
| `apps/server` | Clinic server: sessions, voice-answer matching, LLM and speech connections | TypeScript (Fastify) |
| `apps/pwa` | The phone app and the doctor's page | TypeScript (React, Vite) |
| `services/speech` | Speech-to-text service and the question-audio generator | Python (FastAPI) |
| `infra/` | Docker Compose and HTTPS setup for the clinic PC | YAML |
| `docs/` | Architecture, question-bank rules, deployment, decisions | Markdown |

## Getting started (developer laptop, no GPU needed)

Needs Node 22 and pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm bank:build     # spreadsheets -> content/bank/bank.json (+ content/bank/report.md)
pnpm test           # all TypeScript tests
pnpm dev:server     # http://localhost:8080  (LLM and speech optional, see below)
pnpm dev:pwa        # http://localhost:5173  (patient app),  /#/doctor  (doctor page)
```

Without the LLM and speech service the app still works: patients tap answers, and the questions are
read by the phone's own voice until the reviewed audio clips are generated. To try voice answers,
run the speech service in stub mode (`services/speech/README.md`) and a local LLM
(`docs/deployment.md`).

## Changing questions

Edit the spreadsheet in `content/source/`, run `pnpm bank:build`, and read `content/bank/report.md`.
How the sheet is read is in [docs/question-bank.md](docs/question-bank.md).

## Documents

- [Architecture](docs/architecture.md)
- [How the question sheets are read](docs/question-bank.md)
- [Setting up the clinic PC](docs/deployment.md)
- [Decisions](docs/decisions/)
