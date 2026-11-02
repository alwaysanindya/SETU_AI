/** "What problem are you feeling today?" Groups first (Pain, Fever, ...), then the complaints in a group. */
import { t } from "@setu/bank";
import { useEffect, useState } from "react";
import { api } from "../api";
import type { Ctx } from "../App";
import { ui } from "../i18n";
import { speak } from "../voice/speak";

export function ComplaintScreen({ ctx }: { ctx: Ctx }) {
  const { bank, lang, voice, session } = ctx;
  const [groupId, setGroupId] = useState<string>();
  const [chosen, setChosen] = useState<string[]>([]);
  useEffect(() => void speak(ui("whatProblem", lang), lang, voice, "ui__whatProblem"), [lang, voice]);

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const group = bank.groups.find((g) => g.id === groupId);
  const name = (id: string) => t(bank.complaints.find((c) => c.id === id)!.name, lang);

  return (
    <main className="screen">
      <h1>{ui("whatProblem", lang)}</h1>
      {chosen.length > 0 && (
        <p className="chips">
          {chosen.map((id) => (
            <button key={id} className="chip" onClick={() => toggle(id)}>
              {name(id)} ✕
            </button>
          ))}
        </p>
      )}
      {!group ? (
        <div className="grid">
          {bank.groups.map((g) => (
            <button key={g.id} className="tile" onClick={() => (g.complaintIds.length === 1 ? toggle(g.complaintIds[0]!) : setGroupId(g.id))}>
              {t(g.name, lang)}
            </button>
          ))}
        </div>
      ) : (
        <>
          <p className="hint">{ui("chooseAll", lang)}</p>
          <div className="choices">
            {group.complaintIds.map((id) => (
              <button key={id} className={`choice ${chosen.includes(id) ? "selected" : ""}`} onClick={() => toggle(id)}>
                {name(id)}
              </button>
            ))}
          </div>
          <button className="secondary" onClick={() => setGroupId(undefined)}>
            {ui("back", lang)}
          </button>
        </>
      )}
      <button className="primary" disabled={chosen.length === 0} onClick={() => ctx.update(() => api.chooseComplaints(session.id, chosen))}>
        {ui("next", lang)}
      </button>
    </main>
  );
}
