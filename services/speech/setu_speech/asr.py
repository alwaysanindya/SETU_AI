"""
Speech recognisers. One interface, several engines, chosen with SETU_ASR:

  indicconformer  AI4Bharat IndicConformer 600M multilingual (MIT). The default for the clinic PC.
  stub            Returns a fixed text. For development and tests without a GPU or model download.

Candidates still to compare on clinic recordings (see docs/decisions/0002-open-source-stack.md):
IISc SraVaani-1.0 and Meta Omnilingual ASR.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Protocol

import numpy as np

from .audio import SAMPLE_RATE

LANGS = {"en", "bn", "hi"}


@dataclass
class Transcript:
    text: str
    confidence: float | None = None


class Recogniser(Protocol):
    name: str

    def transcribe(self, samples: np.ndarray, lang: str) -> Transcript: ...


class StubRecogniser:
    name = "stub"

    def __init__(self, text: str = "") -> None:
        self.text = text or os.environ.get("SETU_ASR_STUB_TEXT", "")

    def transcribe(self, samples: np.ndarray, lang: str) -> Transcript:
        return Transcript(self.text)


class IndicConformerRecogniser:
    """
    ai4bharat/indic-conformer-600m-multilingual through transformers (trust_remote_code).
    English is not one of its 22 languages, so English uses the same model only as a fallback;
    a dedicated English model can be added if pilot testing shows it is needed.
    """

    name = "indicconformer"
    MODEL_ID = "ai4bharat/indic-conformer-600m-multilingual"

    def __init__(self, decoder: str = "rnnt") -> None:
        import torch
        from transformers import AutoModel

        self.torch = torch
        self.decoder = decoder
        self.model = AutoModel.from_pretrained(self.MODEL_ID, trust_remote_code=True)
        self.vad = _load_vad()

    def transcribe(self, samples: np.ndarray, lang: str) -> Transcript:
        if self.vad is not None:
            samples = self.vad(samples)
        if samples.size < SAMPLE_RATE // 4:  # under a quarter of a second of speech
            return Transcript("")
        wav = self.torch.from_numpy(samples.copy()).unsqueeze(0)
        text = self.model(wav, lang if lang != "en" else "hi", self.decoder)
        return Transcript(str(text).strip())


def _load_vad():
    """Silero VAD (MIT) trims silence and clinic noise before recognition. Optional."""
    try:
        import torch
        from silero_vad import get_speech_timestamps, load_silero_vad
    except ImportError:
        return None
    model = load_silero_vad()

    def trim(samples: np.ndarray) -> np.ndarray:
        stamps = get_speech_timestamps(torch.from_numpy(samples.copy()), model, sampling_rate=SAMPLE_RATE)
        if not stamps:
            return samples[:0]
        return np.concatenate([samples[s["start"] : s["end"]] for s in stamps])

    return trim


def load_recogniser() -> Recogniser:
    engine = os.environ.get("SETU_ASR", "indicconformer")
    if engine == "stub":
        return StubRecogniser()
    if engine == "indicconformer":
        return IndicConformerRecogniser(os.environ.get("SETU_ASR_DECODER", "rnnt"))
    raise ValueError(f"Unknown SETU_ASR engine: {engine}")
