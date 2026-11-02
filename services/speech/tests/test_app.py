import shutil
import subprocess

import pytest
from fastapi.testclient import TestClient

from setu_speech.app import create_app
from setu_speech.asr import StubRecogniser

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")


def tone_webm() -> bytes:
    """One second of a 440 Hz tone, encoded the way a phone browser would send it."""
    return subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "libopus", "-f", "webm", "pipe:1"],
        capture_output=True,
        check=True,
    ).stdout


def test_transcribe_returns_text():
    client = TestClient(create_app(StubRecogniser("তিন দিন")))
    r = client.post("/transcribe", data={"lang": "bn"}, files={"audio": ("a.webm", tone_webm(), "audio/webm")})
    assert r.status_code == 200
    assert r.json()["text"] == "তিন দিন"


def test_rejects_unknown_language_and_bad_audio():
    client = TestClient(create_app(StubRecogniser("x")))
    assert client.post("/transcribe", data={"lang": "fr"}, files={"audio": ("a", b"x", "audio/webm")}).status_code == 400
    assert client.post("/transcribe", data={"lang": "hi"}, files={"audio": ("a", b"not audio", "audio/webm")}).status_code == 415
