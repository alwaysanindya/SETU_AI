"""
HTTP API, called only by the SETU server (never directly by phones).

  GET  /health                              -> {"ok": true, "engine": "..."}
  POST /transcribe  (multipart: lang, audio) -> {"text": "...", "confidence": null}

Audio is processed in memory and never written to disk or logged.
"""

from __future__ import annotations

from fastapi import FastAPI, Form, HTTPException, UploadFile

from .asr import LANGS, Recogniser, load_recogniser
from .audio import decode

MAX_BYTES = 5 * 1024 * 1024


def create_app(recogniser: Recogniser | None = None) -> FastAPI:
    app = FastAPI(title="SETU speech")
    state: dict[str, Recogniser] = {}

    def get() -> Recogniser:
        if "r" not in state:
            state["r"] = recogniser or load_recogniser()
        return state["r"]

    @app.get("/health")
    def health() -> dict:
        return {"ok": True, "engine": get().name}

    @app.post("/transcribe")
    async def transcribe(lang: str = Form(...), audio: UploadFile = Form(...)) -> dict:
        if lang not in LANGS:
            raise HTTPException(400, f"lang must be one of {sorted(LANGS)}")
        data = await audio.read()
        if len(data) > MAX_BYTES:
            raise HTTPException(413, "Recording too long")
        try:
            samples = decode(data)
        except ValueError as e:
            raise HTTPException(415, str(e)) from e
        result = get().transcribe(samples, lang)
        return {"text": result.text, "confidence": result.confidence}

    return app


app = create_app()
