# 0002 Open-source models only, on one clinic PC

**Status:** accepted, 2026-11

**Context.** The product owner wants everything open source and free (no paid speech services such
as Sarvam, no cloud LLM API). Patient data should stay in the clinic. Licences must allow commercial use.

**Decision.**

| Job | Choice | Licence | Alternatives to test |
| --- | --- | --- | --- |
| LLM (answer matching) | Qwen 3.5 9B Instruct, llama.cpp | Apache-2.0 | Gemma 4 E4B, Qwen 3.5 4B |
| Speech to text | AI4Bharat IndicConformer 600M multilingual | MIT | IISc SraVaani-1.0, Meta Omnilingual ASR |
| Question audio | AI4Bharat Indic Parler-TTS, pre-recorded and reviewed | Apache-2.0 | |
| Silence trimming | Silero VAD | MIT | |
| Audio decoding | ffmpeg | LGPL | |

Not to be used: Meta MMS (non-commercial licence), Coqui XTTS (non-commercial), Piper voices with
unclear licences, IndicF5 (licence unclear), services that are not open source.

**Consequences.** A one-time hardware cost (about ₹77k–1.05 lakh for an RTX 3060 12 GB PC) instead of
per-use fees. Each clinic needs HTTPS on its local network. Model quality on real clinic audio must be
measured before the pilot.
