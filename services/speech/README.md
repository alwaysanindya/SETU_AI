# Speech service

Turns a patient's recorded answer into text. Python, because the open speech models are Python.

| Piece | Model | Licence |
|---|---|---|
| Speech to text | AI4Bharat IndicConformer 600M multilingual | MIT |
| Silence trimming | Silero VAD | MIT |
| Question audio (offline, `scripts/generate_clips.py`) | AI4Bharat Indic Parler-TTS | Apache-2.0 |

Only the SETU server calls this service. Audio stays in memory and is never saved.

## Run for development (no GPU, no model download)

```bash
cd services/speech
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
SETU_ASR=stub SETU_ASR_STUB_TEXT="তিন দিন" uvicorn setu_speech.app:app --port 8082
pytest
```

## Run with the real model

```bash
pip install -e ".[asr]"
uvicorn setu_speech.app:app --port 8082     # first start downloads the model (about 2.5 GB)
```

Or use `infra/docker-compose.yml`, which builds the `Dockerfile` here.

## Recording question audio

```bash
pip install -e ".[tts]"
python scripts/generate_clips.py --bank ../../content/bank/bank.json \
  --ui ../../apps/pwa/src/ui-strings.json --out ../../content/audio
```

A native speaker must listen to every clip before it is used with patients.
