"""Audio clean-up: any browser recording (webm/ogg/mp4) -> 16 kHz mono float samples, using ffmpeg."""

import subprocess

import numpy as np

SAMPLE_RATE = 16_000


def decode(audio: bytes) -> np.ndarray:
    """Decodes with ffmpeg, which handles every format phones record in."""
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", "pipe:1"],
        input=audio,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        raise ValueError(f"Could not decode audio: {proc.stderr.decode(errors='replace')[:200]}")
    return np.frombuffer(proc.stdout, dtype=np.float32)
