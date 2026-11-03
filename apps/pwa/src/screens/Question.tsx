/**
 * One question, shown as the next turn of a chat. Earlier questions and answers stay visible above.
 * The question is read aloud (with a short intro when a new topic starts). The patient can:
 *  - tap an answer (or several, for "any associated symptoms?"), or
 *  - tap the microphone and speak; the app reads back what it understood and the patient confirms, or
 *  - tap "I don't know".
 * Nothing spoken is saved until the patient confirms what the app understood.
 */
import { t } from "@setu/bank";
import type { Answer, Step } from "@setu/engine";
import { useEffect, useRef, useState } from "react";
import { api, type Interpretation } from "../api";
import type { Ctx } from "../App";
import { conversation, describeAnswer, introFor, progress, startsTopic } from "../conversation";
import { ui } from "../i18n";
import { clipKey, speak, stopSpeaking } from "../voice/speak";
import { MicButton } from "./MicButton";

type QuestionStep = Extract<Step, { type: "question" }>;

const UNITS = [
  { id: "days", days: 1 },
  { id: "weeks", days: 7 },
  { id: "months", days: 30 },
  { id: "years", days: 365 },
] as const;

type Suggestion = Interpretation & { heard: string };

export function QuestionScreen({ ctx, step, onCancel }: { ctx: Ctx; step: QuestionStep; onCancel?: () => void }) {
  const { bank, lang, voice, session } = ctx;
  const q = step.question;
  const text = t(q.text, lang);
  const intro = !onCancel && startsTopic(session.state, step.scope) ? introFor(bank, step.scope, lang) : undefined;
  const [selected, setSelected] = useState<string[]>([]);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<(typeof UNITS)[number]>(UNITS[0]);
  const [freeText, setFreeText] = useState("");
  const [suggestion, setSuggestion] = useState<Suggestion>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const spoken = useRef(false);
  const current = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    current.current?.scrollIntoView({ block: "start" });
    if (spoken.current) return;
    spoken.current = true;
    void speak(intro ? `${intro} ${text}` : text, lang, voice, intro ? undefined : clipKey(step.scope, q.id));
    return () => stopSpeaking();
  }, [intro, text, lang, voice, step.scope, q.id]);

  useEffect(() => {
    if (suggestion || notice) current.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [suggestion, notice, selected]);

  const submit = (answer: Answer) => {
    setBusy(true);
    return ctx
      .update(() => api.answer(session.id, step.scope, q.id, answer))
      .then(() => onCancel?.())
      .finally(() => setBusy(false));
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

  async function heard(transcript: string) {
    setNotice(undefined);
    if (!transcript.trim()) {
      setNotice(ui("notUnderstood", lang));
      return;
    }
    setBusy(true);
    try {
      const result = await api.interpret(session.id, step.scope, q.id, transcript);
      setSuggestion({ ...result, heard: transcript });
      if (result.answer) void speak(`${ui("didYouMean", lang)} ${describeAnswer(q, result.answer, lang)}`, lang, voice);
      else void speak(ui("notUnderstood", lang), lang, voice);
    } catch {
      setNotice(ui("notUnderstood", lang));
    } finally {
      setBusy(false);
    }
  }

  const needsDetail = selected.filter((id) => q.options.find((o) => o.id === id)?.detail);
  const canSubmitChoice = selected.length > 0 && needsDetail.every((id) => details[id]?.trim());
  const { answered, total } = progress(bank, session.state);
  const history = onCancel ? [] : conversation(bank, session.state);

  return (
    <main className="screen chat">
      {!onCancel && (
        <div className="progress" aria-label={ui("progress", lang).replace("{n}", String(answered + 1)).replace("{total}", String(total))}>
          <div className="bar" style={{ width: `${Math.round((answered / Math.max(total, 1)) * 100)}%` }} />
        </div>
      )}

      <div className="thread">
        {history.map((item, i) =>
          item.kind === "intro" ? (
            <p key={i} className="bubble bot intro">{item.text}</p>
          ) : item.kind === "question" ? (
            <p key={i} className="bubble bot">{item.text}</p>
          ) : (
            <p key={i} className="bubble me">{item.voice && "🎤 "}{item.text}</p>
          ),
        )}
        {intro && <p className="bubble bot intro">{intro}</p>}
        <p ref={current} className="bubble bot current">
          {text}
          <button className="icon" aria-label={ui("listen", lang)} onClick={() => speak(text, lang, voice, clipKey(step.scope, q.id))}>
            🔊
          </button>
        </p>
        {suggestion && <p className="bubble me heard">🎤 {suggestion.heard}</p>}
        {suggestion?.answer && (
          <div className="bubble bot suggestion">
            <span>{ui("didYouMean", lang)}</span>
            <strong>{describeAnswer(q, suggestion.answer, lang)}</strong>
          </div>
        )}
        {suggestion && !suggestion.answer && <p className="bubble bot warn">{ui("notUnderstood", lang)}</p>}
        {notice && <p className="bubble bot warn">{notice}</p>}
      </div>

      <div className="answer-area">
        {suggestion?.answer ? (
          <div className="row">
            <button className="primary grow" disabled={busy} onClick={() => submit(suggestion.answer!)}>
              ✓ {ui("yesCorrect", lang)}
            </button>
            <button className="secondary" onClick={() => setSuggestion(undefined)}>
              {ui("tryAgain", lang)}
            </button>
          </div>
        ) : (
          <>
            {(q.kind === "single" || q.kind === "multi") && (
              <>
                {q.kind === "multi" && <p className="hint">{ui("chooseAll", lang)}</p>}
                <div className={`choices ${q.options.length > 4 ? "two-col" : ""}`}>
                  {q.options.map((o) => (
                    <button key={o.id} className={`choice ${selected.includes(o.id) ? "selected" : ""}`} disabled={busy} onClick={() => pick(o.id)}>
                      {t(o.label, lang)}
                    </button>
                  ))}
                </div>
                {needsDetail.map((id) => (
                  <label key={id} className="field">
                    <span>{ui("describe", lang)}</span>
                    <input autoFocus value={details[id] ?? ""} onChange={(e) => setDetails((d) => ({ ...d, [id]: e.target.value }))} />
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
              <div className="row">
                <input className="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
                {q.kind === "duration" && (
                  <select className="unit" value={unit.id} onChange={(e) => setUnit(UNITS.find((u) => u.id === e.target.value)!)}>
                    {UNITS.map((u) => (
                      <option key={u.id} value={u.id}>
                        {ui(u.id, lang)}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  className="primary"
                  disabled={amount === "" || busy}
                  onClick={() => submit({ value: Number(amount) * (q.kind === "duration" ? unit.days : 1), source: "tap" })}
                >
                  ➜
                </button>
              </div>
            )}

            {q.kind === "date" && (
              <div className="row">
                <input type="date" className="grow" value={freeText} onChange={(e) => setFreeText(e.target.value)} />
                <button className="primary" disabled={!freeText || busy} onClick={() => submit({ value: freeText, source: "tap" })}>
                  ➜
                </button>
              </div>
            )}

            {q.kind === "text" && (
              <div className="row">
                <input className="grow" value={freeText} onChange={(e) => setFreeText(e.target.value)} />
                <button className="primary" disabled={!freeText.trim() || busy} onClick={() => submit({ value: freeText.trim(), source: "tap" })}>
                  ➜
                </button>
              </div>
            )}

            <div className="row">
              <MicButton lang={lang} disabled={busy} onHeard={heard} onUnavailable={() => setNotice(ui("micBlocked", lang))} />
              <button className="secondary" disabled={busy} onClick={() => submit({ skipped: "dont_know", source: "tap" })}>
                {ui("dontKnow", lang)}
              </button>
            </div>
            {onCancel && (
              <button className="secondary" onClick={onCancel}>
                {ui("cancel", lang)}
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
