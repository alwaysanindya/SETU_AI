/**
 * One question. The question is read aloud and shown. The patient can:
 *  - tap an answer (or several, for "any associated symptoms?"), or
 *  - tap the microphone and speak; the server suggests an answer and the patient confirms it, or
 *  - say or tap "I don't know".
 * Nothing spoken is saved until the patient confirms what the app understood.
 */
import { t, type Question } from "@setu/bank";
import type { Answer, Step } from "@setu/engine";
import { useEffect, useRef, useState } from "react";
import { api, type Interpretation } from "../api";
import type { Ctx } from "../App";
import { ui } from "../i18n";
import { startRecording, type Recording } from "../voice/record";
import { clipKey, speak, stopSpeaking } from "../voice/speak";

type QuestionStep = Extract<Step, { type: "question" }>;

const UNITS = [
  { id: "days", days: 1 },
  { id: "weeks", days: 7 },
  { id: "months", days: 30 },
  { id: "years", days: 365 },
] as const;

/** How a suggested answer reads back to the patient: "Severe", "3 days", "I don't know". */
function describe(q: Question, a: Answer, ctx: Ctx): string {
  if (a.skipped) return ui("dontKnow", ctx.lang);
  if (a.optionIds) return a.optionIds.map((id) => t(q.options.find((o) => o.id === id)!.label, ctx.lang)).join(", ");
  if (q.kind === "duration") return `${a.value} ${ui("days", ctx.lang)}`;
  return String(a.value);
}

export function QuestionScreen({ ctx, step }: { ctx: Ctx; step: QuestionStep }) {
  const { lang, voice, session } = ctx;
  const q = step.question;
  const text = t(q.text, lang);
  const [selected, setSelected] = useState<string[]>([]);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<(typeof UNITS)[number]>(UNITS[0]);
  const [freeText, setFreeText] = useState("");
  const [recording, setRecording] = useState<Recording>();
  const [suggestion, setSuggestion] = useState<Interpretation>();
  const [busy, setBusy] = useState(false);
  const spoken = useRef(false);

  useEffect(() => {
    if (spoken.current) return;
    spoken.current = true;
    void speak(text, lang, voice, clipKey(step.scope, q.id));
    return () => stopSpeaking();
  }, [text, lang, voice, step.scope, q.id]);

  const submit = (answer: Answer) => {
    setBusy(true);
    return ctx.update(() => api.answer(session.id, step.scope, q.id, answer)).finally(() => setBusy(false));
  };

  function pick(id: string) {
    const option = q.options.find((o) => o.id === id)!;
    if (q.kind === "single") {
      if (option.detail) setSelected([id]);
      else void submit({ optionIds: [id], source: "tap" });
      return;
    }
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (option.exclusive) return [id];
      return [...cur.filter((x) => !q.options.find((o) => o.id === x)?.exclusive), id];
    });
  }

  async function toggleMic() {
    if (!recording) {
      stopSpeaking();
      setSuggestion(undefined);
      try {
        setRecording(await startRecording());
      } catch {
        setSuggestion({ method: "none" }); // no microphone permission: show the "please tap" message
      }
      return;
    }
    setBusy(true);
    try {
      const audio = await recording.stop();
      setRecording(undefined);
      const { text: heard } = await api.transcribe(audio, lang);
      const result = heard.trim() ? await api.interpret(session.id, step.scope, q.id, heard) : { method: "none" as const };
      setSuggestion(result);
      if (result.answer) void speak(`${ui("didYouMean", lang)} ${describe(q, result.answer, ctx)}`, lang, voice);
    } catch {
      setSuggestion({ method: "none" });
    } finally {
      setBusy(false);
    }
  }

  const needsDetail = selected.filter((id) => q.options.find((o) => o.id === id)?.detail);
  const canSubmitChoice = selected.length > 0 && needsDetail.every((id) => details[id]?.trim());

  return (
    <main className="screen">
      <h1 className="question">
        {text}
        <button className="icon" aria-label={ui("listen", lang)} onClick={() => speak(text, lang, voice, clipKey(step.scope, q.id))}>
          🔊
        </button>
      </h1>

      {suggestion?.answer ? (
        <div className="suggestion">
          <p>{ui("didYouMean", lang)}</p>
          <p className="big">{describe(q, suggestion.answer, ctx)}</p>
          <button className="primary" disabled={busy} onClick={() => submit(suggestion.answer!)}>
            {ui("yesCorrect", lang)}
          </button>
          <button className="secondary" onClick={() => setSuggestion(undefined)}>
            {ui("tryAgain", lang)}
          </button>
        </div>
      ) : (
        <>
          {suggestion && <p className="hint warn">{ui("notUnderstood", lang)}</p>}

          {(q.kind === "single" || q.kind === "multi") && (
            <>
              {q.kind === "multi" && <p className="hint">{ui("chooseAll", lang)}</p>}
              <div className="choices">
                {q.options.map((o) => (
                  <button key={o.id} className={`choice ${selected.includes(o.id) ? "selected" : ""}`} disabled={busy} onClick={() => pick(o.id)}>
                    {t(o.label, lang)}
                  </button>
                ))}
              </div>
              {needsDetail.map((id) => (
                <label key={id} className="field">
                  <span>{q.options.find((o) => o.id === id)?.detail?.prompt ?? ui("describe", lang)}</span>
                  <input value={details[id] ?? ""} onChange={(e) => setDetails((d) => ({ ...d, [id]: e.target.value }))} />
                </label>
              ))}
              {(q.kind === "multi" || needsDetail.length > 0) && (
                <button
                  className="primary"
                  disabled={!canSubmitChoice || busy}
                  onClick={() => submit({ optionIds: selected, details: needsDetail.length ? details : undefined, source: "tap" })}
                >
                  {ui("next", lang)}
                </button>
              )}
            </>
          )}

          {(q.kind === "duration" || q.kind === "number") && (
            <>
              <input className="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
              {q.kind === "duration" && (
                <div className="choices row-wrap">
                  {UNITS.map((u) => (
                    <button key={u.id} className={`choice small ${unit.id === u.id ? "selected" : ""}`} onClick={() => setUnit(u)}>
                      {ui(u.id, lang)}
                    </button>
                  ))}
                </div>
              )}
              <button
                className="primary"
                disabled={amount === "" || busy}
                onClick={() => submit({ value: Number(amount) * (q.kind === "duration" ? unit.days : 1), source: "tap" })}
              >
                {ui("next", lang)}
              </button>
            </>
          )}

          {q.kind === "date" && (
            <>
              <input type="date" className="number" value={freeText} onChange={(e) => setFreeText(e.target.value)} />
              <button className="primary" disabled={!freeText || busy} onClick={() => submit({ value: freeText, source: "tap" })}>
                {ui("next", lang)}
              </button>
            </>
          )}

          {q.kind === "text" && (
            <>
              <textarea value={freeText} onChange={(e) => setFreeText(e.target.value)} rows={3} />
              <button className="primary" disabled={!freeText.trim() || busy} onClick={() => submit({ value: freeText.trim(), source: "tap" })}>
                {ui("next", lang)}
              </button>
            </>
          )}

          <div className="row bottom">
            <button className={`mic ${recording ? "on" : ""}`} disabled={busy} onClick={toggleMic}>
              🎤 {recording ? ui("stop", lang) : ui("speak", lang)}
            </button>
            <button className="secondary" disabled={busy} onClick={() => submit({ skipped: "dont_know", source: "tap" })}>
              {ui("dontKnow", lang)}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
