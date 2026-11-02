# SETU speech service. Needs an NVIDIA GPU for real-time recognition (runs on CPU, slowly).
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pyproject.toml ./
COPY setu_speech ./setu_speech
RUN pip install --no-cache-dir ".[asr]"
ENV SETU_ASR=indicconformer HF_HOME=/models/hf
EXPOSE 8082
CMD ["uvicorn", "setu_speech.app:app", "--host", "0.0.0.0", "--port", "8082"]
