/** Review what was recorded, confirm, and the closing screen. */
import { useEffect, useState } from "react";
import { api } from "../api";
import type { Ctx } from "../App";
import { ui } from "../i18n";
import { speak } from "../voice/speak";

export function ReviewScreen({ ctx }: { ctx: Ctx }) {
  const { lang, voice, session } = ctx;
  const [lines, setLines] = useState<string[]>();
  useEffect(() => {
    void speak(ui("reviewTitle", lang), lang, voice, "ui__reviewTitle");
    api.summary(session.id).then(({ summary }) => setLines(summary.complaintHistory.map((h) => h.text)));
  }, [lang, voice, session.id]);

  return (
    <main className="screen">
      <h1>{ui("reviewTitle", lang)}</h1>
      {/* The recorded history is in English for the doctor. Translated read-back comes with reviewed note templates. */}
      <ul className="review" lang="en">
        {lines?.map((l) => <li key={l}>{l}</li>)}
      </ul>
      <button className="primary" onClick={() => ctx.update(() => api.confirm(session.id))}>
        {ui("confirm", lang)}
      </button>
    </main>
  );
}

export function DoneScreen({ ctx }: { ctx: Ctx }) {
  useEffect(() => void speak(ui("doneTitle", ctx.lang), ctx.lang, ctx.voice, "ui__doneTitle"), [ctx.lang, ctx.voice]);
  return (
    <main className="screen center">
      <h1>{ui("doneTitle", ctx.lang)}</h1>
      <button className="secondary" onClick={() => location.reload()}>
        ↺
      </button>
    </main>
  );
}
