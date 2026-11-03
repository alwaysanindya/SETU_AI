/**
 * "What problem are you feeling today?" Picture tiles for each group (Pain, Fever, ...), then the
 * complaints in a group. The patient can also say the problem; spoken words are matched against
 * complaint and group names in their language.
 */
import { t, type Bank, type Lang } from "@setu/bank";
import { normalise } from "@setu/engine";
import { useEffect, useState } from "react";
import { api } from "../api";
import type { Ctx } from "../App";
import { ui } from "../i18n";
import { speak } from "../voice/speak";
import { MicButton } from "./MicButton";

const ICONS: Record<string, string> = {
  pain: "🤕", fever: "🌡️", "cough-throat-problem": "😷", "difficulty-in-breathing": "🫁", vomiting: "🤮",
  diarrhoea: "🚽", "acidity-indigestion": "🔥", dizziness: "💫", fainting: "😵", palpitation: "💓",
  weakness: "🥱", "swelling-tumour": "🎈", "skin-rash": "🔴", boils: "🟠", ulcer: "🩹", injury: "🦴",
  "bleeding-with-stool": "🩸", "yellow-urine": "🟡", "urine-problem": "💧", "gynae-problems": "♀️", other: "❓",
};

/**
 * Complaints mentioned in what was said: the full name ("chest pain", "বুকে ব্যথা"), or a word that
 * belongs to only one complaint name ("chest", "বুক"). Words shared by several names ("pain") do not count.
 */
function matchComplaints(bank: Bank, heard: string, lang: Lang): string[] {
  const text = ` ${normalise(heard)} `;
  const names = bank.complaints.map((c) => ({ id: c.id, names: [c.name.en, c.name[lang]].filter((n): n is string => !!n).map(normalise) }));
  for (const g of bank.groups) {
    if (g.complaintIds.length === 1) names.find((n) => n.id === g.complaintIds[0])?.names.push(...[g.name.en, g.name[lang]].filter((n): n is string => !!n).map(normalise));
  }
  const wordOwners = new Map<string, Set<string>>();
  for (const n of names) for (const name of n.names) for (const w of name.split(" ")) if (w.length >= 3) wordOwners.set(w, (wordOwners.get(w) ?? new Set()).add(n.id));
  const hits = new Set<string>();
  for (const n of names) {
    if (n.names.some((name) => text.includes(` ${name} `))) hits.add(n.id);
    for (const name of n.names) for (const w of name.split(" ")) if (wordOwners.get(w)?.size === 1 && text.includes(` ${w} `)) hits.add(n.id);
  }
  return [...hits];
}

export function ComplaintScreen({ ctx }: { ctx: Ctx }) {
  const { bank, lang, voice, session } = ctx;
  const [groupId, setGroupId] = useState<string>();
  const [chosen, setChosen] = useState<string[]>([]);
  const [notice, setNotice] = useState<string>();
  useEffect(() => void speak(`${ui("whatProblem", lang)} ${ui("sayProblem", lang)}`, lang, voice), [lang, voice]);

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const group = bank.groups.find((g) => g.id === groupId);
  const name = (id: string) => t(bank.complaints.find((c) => c.id === id)!.name, lang);

  function heard(text: string) {
    const ids = matchComplaints(bank, text, lang);
    if (ids.length === 0) {
      setNotice(`${ui("youSaid", lang)} "${text}". ${ui("notUnderstood", lang)}`);
      return;
    }
    setNotice(undefined);
    setChosen((c) => [...c, ...ids.filter((id) => !c.includes(id))]);
  }

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
      {notice && <p className="hint warn">{notice}</p>}
      {!group ? (
        <div className="grid">
          {bank.groups.map((g) => {
            const picked = g.complaintIds.some((id) => chosen.includes(id));
            return (
              <button
                key={g.id}
                className={`tile ${picked ? "selected" : ""}`}
                onClick={() => (g.complaintIds.length === 1 ? toggle(g.complaintIds[0]!) : setGroupId(g.id))}
              >
                <span className="tile-icon">{ICONS[g.id] ?? "•"}</span>
                {t(g.name, lang)}
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <h2>
            {ICONS[group.id]} {t(group.name, lang)}
          </h2>
          <p className="hint">{ui("chooseAll", lang)}</p>
          <div className="choices two-col">
            {group.complaintIds.map((id) => (
              <button key={id} className={`choice ${chosen.includes(id) ? "selected" : ""}`} onClick={() => toggle(id)}>
                {name(id)}
              </button>
            ))}
          </div>
          <button className="secondary" onClick={() => setGroupId(undefined)}>
            ← {ui("back", lang)}
          </button>
        </>
      )}
      <div className="row sticky">
        <MicButton lang={lang} onHeard={heard} onUnavailable={() => setNotice(ui("micBlocked", lang))} />
        <button className="primary" disabled={chosen.length === 0} onClick={() => ctx.update(() => api.chooseComplaints(session.id, chosen))}>
          {ui("next", lang)} ➜
        </button>
      </div>
    </main>
  );
}
