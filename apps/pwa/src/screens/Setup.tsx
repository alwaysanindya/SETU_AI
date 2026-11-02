/** The first four screens: language, voice, consent, age and sex. */
import type { Lang } from "@setu/bank";
import type { Patient, Sex } from "@setu/engine";
import { useEffect, useState } from "react";
import { ui } from "../i18n";
import { speak, type Voice } from "../voice/speak";

const LANGS: { lang: Lang; name: string }[] = [
  { lang: "bn", name: "বাংলা" },
  { lang: "hi", name: "हिंदी" },
  { lang: "en", name: "English" },
];

export function LanguageScreen({ onPick }: { onPick: (l: Lang) => void }) {
  return (
    <main className="screen">
      <h1>{LANGS.map((l) => ui("chooseLanguage", l.lang)).join(" / ")}</h1>
      <div className="choices">
        {LANGS.map((l) => (
          <button key={l.lang} className="choice big" lang={l.lang} onClick={() => onPick(l.lang)}>
            {l.name}
          </button>
        ))}
      </div>
    </main>
  );
}

export function VoiceScreen({ lang, onPick }: { lang: Lang; onPick: (v: Voice) => void }) {
  useEffect(() => void speak(ui("chooseVoice", lang), lang, "female", "ui__chooseVoice"), [lang]);
  const voices: { v: Voice; label: string }[] = [
    { v: "female", label: ui("femaleVoice", lang) },
    { v: "male", label: ui("maleVoice", lang) },
  ];
  return (
    <main className="screen">
      <h1>{ui("chooseVoice", lang)}</h1>
      <div className="choices">
        {voices.map(({ v, label }) => (
          <div key={v} className="row">
            <button className="choice big grow" onClick={() => onPick(v)}>
              {label}
            </button>
            <button className="secondary" aria-label={ui("listen", lang)} onClick={() => speak(label, lang, v, `ui__${v}Voice`)}>
              🔊
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}

export function ConsentScreen({ lang, voice, onAgree }: { lang: Lang; voice: Voice; onAgree: () => void }) {
  useEffect(() => void speak(ui("consentBody", lang), lang, voice, "ui__consentBody"), [lang, voice]);
  return (
    <main className="screen">
      <h1>{ui("consentTitle", lang)}</h1>
      <p className="lead">{ui("consentBody", lang)}</p>
      <button className="primary" onClick={onAgree}>
        {ui("agree", lang)}
      </button>
    </main>
  );
}

export function PatientScreen({ lang, voice, onDone }: { lang: Lang; voice: Voice; onDone: (p: Patient) => void }) {
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<Sex>();
  useEffect(() => void speak(ui("age", lang), lang, voice, "ui__age"), [lang, voice]);
  const ageNum = Number(age);
  const valid = age !== "" && Number.isInteger(ageNum) && ageNum >= 0 && ageNum <= 120 && sex;
  return (
    <main className="screen">
      <label className="field">
        <span>{ui("age", lang)}</span>
        <input inputMode="numeric" pattern="[0-9]*" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} />
      </label>
      <h2>{ui("sex", lang)}</h2>
      <div className="choices">
        {(["male", "female", "other"] as const).map((s) => (
          <button key={s} className={`choice ${sex === s ? "selected" : ""}`} onClick={() => setSex(s)}>
            {ui(s, lang)}
          </button>
        ))}
      </div>
      <button className="primary" disabled={!valid} onClick={() => onDone({ ageYears: ageNum, sex })}>
        {ui("next", lang)}
      </button>
    </main>
  );
}
