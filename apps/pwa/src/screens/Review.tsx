/** Review every answer in the patient's language, change any of them, confirm; then the closing screen. */
import { useEffect } from "react";
import { api } from "../api";
import type { Ctx } from "../App";
import { conversation } from "../conversation";
import { ui } from "../i18n";
import { speak } from "../voice/speak";

export function ReviewScreen({ ctx, onEdit }: { ctx: Ctx; onEdit: (scope: string, questionId: string) => void }) {
  const { bank, lang, voice, session } = ctx;
  useEffect(() => void speak(ui("reviewTitle", lang), lang, voice, "ui__reviewTitle"), [lang, voice]);
  const items = conversation(bank, session.state);

  return (
    <main className="screen">
      <h1>{ui("reviewTitle", lang)}</h1>
      <div className="review">
        {items.map((item, i) => {
          if (item.kind === "intro") return <h2 key={i}>{item.text}</h2>;
          if (item.kind === "question") return <p key={i} className="rq">{item.text}</p>;
          return (
            <div key={i} className="ra">
              <strong>{item.text}</strong>
              <button className="link" onClick={() => onEdit(item.scope, item.questionId)}>
                {ui("change", lang)}
              </button>
            </div>
          );
        })}
      </div>
      <button className="primary sticky" onClick={() => ctx.update(() => api.confirm(session.id))}>
        {ui("confirm", lang)}
      </button>
    </main>
  );
}

export function DoneScreen({ ctx }: { ctx: Ctx }) {
  useEffect(() => void speak(ui("doneTitle", ctx.lang), ctx.lang, ctx.voice, "ui__doneTitle"), [ctx.lang, ctx.voice]);
  return (
    <main className="screen center">
      <p className="big-icon">✅</p>
      <h1>{ui("doneTitle", ctx.lang)}</h1>
      <a className="secondary button-link" href={`#/doctor/${ctx.session.id}`}>
        🩺 Doctor view
      </a>
      <button className="secondary" onClick={() => location.reload()}>
        ↺ New patient
      </button>
    </main>
  );
}
