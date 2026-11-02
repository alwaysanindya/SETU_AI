"""
Pre-records every question and app phrase with AI4Bharat Indic Parler-TTS (Apache-2.0).

    python scripts/generate_clips.py --bank ../../content/bank/bank.json \
        --ui ../../apps/pwa/src/ui-strings.json --out ../../content/audio

Writes <out>/<voice>/<lang>/<key>.mp3, where key is "<scope>__<questionId>" for questions and
"ui__<stringId>" for app phrases (the same keys the app asks for in apps/pwa/src/voice/speak.ts).
Only text that has a translation in that language is recorded; English is always recorded.
Existing clips are skipped, so re-running only records new or missing ones.
Every clip must be listened to by a native speaker before it is used with patients.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

# Named speakers recommended in the Indic Parler-TTS model card, by language and voice.
SPEAKERS = {
    ("bn", "female"): "Aditi",
    ("bn", "male"): "Arjun",
    ("hi", "female"): "Divya",
    ("hi", "male"): "Rohit",
    ("en", "female"): "Mary",
    ("en", "male"): "Thoma",
}
STYLE = "speaks slowly and clearly in a warm, calm tone, with very clear audio and no background noise."


def texts(bank: dict, ui: dict, lang: str):
    for sid, by_lang in ui.items():
        if by_lang.get(lang):
            yield f"ui__{sid}", by_lang[lang]
    sections = [(c["id"], c["questions"]) for c in bank["complaints"]]
    sections += [("past-history", bank["pastHistory"]["questions"]), ("personal-history", bank["personalHistory"]["questions"])]
    for scope, questions in sections:
        for q in questions:
            text = q["text"].get(lang)
            if text:
                yield f"{scope}__{q['id']}", text


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--bank", required=True, type=Path)
    p.add_argument("--ui", required=True, type=Path)
    p.add_argument("--out", required=True, type=Path)
    p.add_argument("--langs", default="bn,hi,en")
    p.add_argument("--device", default="cuda")
    args = p.parse_args()

    import soundfile as sf
    import torch
    from parler_tts import ParlerTTSForConditionalGeneration
    from transformers import AutoTokenizer

    model = ParlerTTSForConditionalGeneration.from_pretrained("ai4bharat/indic-parler-tts").to(args.device)
    tokenizer = AutoTokenizer.from_pretrained("ai4bharat/indic-parler-tts")
    desc_tokenizer = AutoTokenizer.from_pretrained(model.config.text_encoder._name_or_path)

    bank = json.loads(args.bank.read_text(encoding="utf8"))
    ui = json.loads(args.ui.read_text(encoding="utf8"))
    for lang in args.langs.split(","):
        for voice in ("female", "male"):
            folder = args.out / voice / lang
            folder.mkdir(parents=True, exist_ok=True)
            description = f"{SPEAKERS[(lang, voice)]} {STYLE}"
            desc = desc_tokenizer(description, return_tensors="pt").to(args.device)
            for key, text in texts(bank, ui, lang):
                mp3 = folder / f"{key}.mp3"
                if mp3.exists():
                    continue
                prompt = tokenizer(text, return_tensors="pt").to(args.device)
                with torch.no_grad():
                    audio = model.generate(
                        input_ids=desc.input_ids,
                        attention_mask=desc.attention_mask,
                        prompt_input_ids=prompt.input_ids,
                        prompt_attention_mask=prompt.attention_mask,
                    )
                wav = folder / f"{key}.wav"
                sf.write(wav, audio.cpu().numpy().squeeze(), model.config.sampling_rate)
                subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(wav), "-b:a", "48k", str(mp3)], check=True)
                wav.unlink()
                print(f"{voice}/{lang}/{key}.mp3")


if __name__ == "__main__":
    main()
