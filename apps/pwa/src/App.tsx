/**
 * Screen order for the patient:
 *   language -> voice -> consent -> age/sex -> [interview: complaints, questions, red-flag pause] -> review -> done
 * During the interview the server's `step` decides which screen shows (see packages/engine/src/flow.ts).
 * The doctor's page is at #/doctor.
 */
import type { Bank, Lang } from "@setu/bank";
import { useEffect, useState } from "react";
import { api, DEMO, type SessionView } from "./api";
import { ui } from "./i18n";
import { ComplaintScreen } from "./screens/Complaints";
import { DoctorScreen } from "./screens/Doctor";
import { QuestionScreen } from "./screens/Question";
import { RedFlagScreen } from "./screens/RedFlag";
import { DoneScreen, ReviewScreen } from "./screens/Review";
import { ConsentScreen, LanguageScreen, PatientScreen, VoiceScreen } from "./screens/Setup";
import type { Voice } from "./voice/speak";

/** What every interview screen gets. */
export interface Ctx {
  bank: Bank;
  lang: Lang;
  voice: Voice;
  session: SessionView;
  /** Runs a server call that returns the updated session, showing errors in one place. */
  update: (call: () => Promise<SessionView>) => Promise<void>;
}

type Phase = "language" | "voice" | "consent" | "patient" | "interview";

export function App() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return (
    <>
      {DEMO && (
        <div className="demo-banner">
          Demo only, not for patients. Answers stay on this device.{" "}
          {hash.startsWith("#/doctor") ? <a href="#/">Patient app</a> : <a href="#/doctor">Doctor view</a>}
        </div>
      )}
      {hash.startsWith("#/doctor") ? <DoctorScreen sessionId={hash.split("/")[2]} /> : <PatientApp />}
    </>
  );
}

function PatientApp() {
  const [bank, setBank] = useState<Bank>();
  const [phase, setPhase] = useState<Phase>("language");
  const [lang, setLang] = useState<Lang>("bn");
  const [voice, setVoice] = useState<Voice>("female");
  const [session, setSession] = useState<SessionView>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    api.bank().then(setBank, () => setError("bank"));
  }, []);

  async function update(call: () => Promise<SessionView>) {
    setError(undefined);
    try {
      setSession(await call());
    } catch (e) {
      console.error(e);
      setError((e as Error).message);
    }
  }

  if (!bank) return <main className="screen center">{error ? ui("error", lang) : "…"}</main>;

  let screen;
  if (phase === "language") screen = <LanguageScreen onPick={(l) => (setLang(l), setPhase("voice"))} />;
  else if (phase === "voice") screen = <VoiceScreen lang={lang} onPick={(v) => (setVoice(v), setPhase("consent"))} />;
  else if (phase === "consent") screen = <ConsentScreen lang={lang} voice={voice} onAgree={() => setPhase("patient")} />;
  else if (phase === "patient" || !session)
    screen = <PatientScreen lang={lang} voice={voice} onDone={(p) => update(() => api.start(lang, p)).then(() => setPhase("interview"))} />;
  else {
    const ctx: Ctx = { bank, lang, voice, session, update };
    const step = session.step;
    if (step.type === "red_flag") screen = <RedFlagScreen ctx={ctx} rules={step.rules} />;
    else if (step.type === "choose_complaint") screen = <ComplaintScreen ctx={ctx} />;
    else if (step.type === "question") screen = <QuestionScreen key={`${step.scope}/${step.question.id}`} ctx={ctx} step={step} />;
    else if (step.type === "review") screen = <ReviewScreen ctx={ctx} />;
    else screen = <DoneScreen ctx={ctx} />;
  }

  return (
    <>
      {error && <div className="error">{ui("error", lang)}</div>}
      {screen}
    </>
  );
}
