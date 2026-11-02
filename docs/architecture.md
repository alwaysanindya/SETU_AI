# Architecture

## Principles

1. **Rules decide, AI assists.** The question order, linked complaints, red flags and note wording
   all come from the clinicians' content through deterministic code. The AI never chooses a question,
   never raises or hides a red flag and never writes free text into the note.
2. **Content is data.** No clinical wording lives in code. Clinicians change the spreadsheets and YAML
   in `content/`; the compiler checks them and reports problems.
3. **State is plain JSON.** An interview is one `InterviewState` object (`packages/engine/src/state.ts`).
   Everything else (next step, summary) is computed from it by pure functions, so results are
   repeatable and easy to test.
4. **Open source, on site.** All models run on the clinic PC under licences that allow commercial use.
5. **The patient confirms.** A spoken answer is read back ("Did you mean: Severe?") and saved only
   when the patient agrees. Uncertain voice answers are listed in the doctor summary.

## Parts

### `packages/bank` – the contract
Zod schema for the compiled bank: complaints → questions → options, with note templates, linked
complaints, staff instructions, sex-specific questions, red-flag rules and codes. Everything else
reads only this format.

### `packages/bank-compiler` – content → bank
| File | Job |
| --- | --- |
| `read-xlsx.ts` | Reads sheets; merged cells keep their value only in the first cell |
| `answers.ts` | Reads the "Possible answers" mini-language (`;` lists, `_days`, `[describe]`, …) |
| `complaints.ts` | Groups rows into complaints and questions, builds options and templates |
| `personal-history.ts` | Reads the personal-history workbook (BOOLEAN, NUMBER, … types) |
| `compile.ts` | Puts it together: links, codes, groups, red-flag checks, schema validation |
| `report.ts`, `cli.ts` | Writes `bank.json` and the clinician report |

Errors (for example a `~Name` link to a complaint that does not exist) stop the build. Warnings go to
`content/bank/report.md`.

### `packages/engine` – the interview
| File | Job |
| --- | --- |
| `state.ts` | The `InterviewState` and `Answer` types |
| `flow.ts` | `nextStep` and the functions that change state (`chooseComplaints`, `answerQuestion`, …) |
| `red-flags.ts` | Evaluates red-flag rules; no AI involved |
| `note.ts` | Fills note templates ("started _" → "started upper centre") |
| `summary.ts` | Builds the two outputs: coded complaints and the doctor summary |

Interview order: red-flag pause (if any) → choose complaints → each complaint's questions (linked
urgent complaints such as chest pain jump to the front) → past medical history → personal history →
review → done.

### `apps/server` – clinic server
Fastify. Each route loads a session, calls one engine function, saves and returns the new state with
the next step (`src/app.ts` lists the routes). Voice answers go through `src/llm/interpret.ts`:

1. "I don't know" phrases, numbers and durations ("teen din", "দুই সপ্তাহ") → parsed directly
2. option labels and synonyms (`src/llm/synonyms.ts`) → matched directly
3. otherwise the local LLM (`src/llm/gateway.ts`) picks from the allowed option ids only, with its
   output forced to a JSON schema; if it is down or slow, the patient taps instead

Sessions are kept in memory (`src/store.ts`). A Postgres store with the same interface comes before
real patient data is stored.

### `apps/pwa` – phone app and doctor page
React + Vite, installable (vite-plugin-pwa). The server's `step` decides which screen shows.
Questions play pre-recorded clips from `/audio/<voice>/<lang>/<key>.mp3`; if a clip is missing the
phone's own voice is used as a stop-gap. Fixed app wording is in `src/ui-strings.json`.

### `services/speech` – speech to text
Python FastAPI. ffmpeg decodes any phone recording, Silero VAD trims silence, AI4Bharat
IndicConformer 600M transcribes. `scripts/generate_clips.py` records every question with Indic
Parler-TTS ahead of time.

## Data flow for one spoken answer

```
patient speaks ─▶ phone records (webm/opus) ─▶ POST /api/transcribe ─▶ speech service ─▶ "তিন দিন"
  ─▶ POST /api/sessions/:id/interpret ─▶ duration parser ─▶ { value: 3 }  (LLM not needed)
  ─▶ phone: "Did you mean: 3 days?" ─▶ patient taps Yes ─▶ POST /api/sessions/:id/answers
  ─▶ engine.answerQuestion ─▶ red-flag check ─▶ next step
```

## Not built yet
- Postgres storage, staff login, audit log, data retention
- Translations of questions and note read-back (bn/hi), reviewed by native speakers and clinicians
- Offline interviews on the phone (the engine is shared code, so it can run in the app later)
- SNOMED CT codes; clinician sign-off of codes and red flags
- Model evaluation on real clinic recordings (IndicConformer vs SraVaani vs Omnilingual; Qwen 3.5 9B vs Gemma 4 E4B)
