/**
 * Red-flag pause. The patient sees only "please show this phone to the staff".
 * Staff tap "I am staff", read the warning(s), enter their name and acknowledge. The interview then continues.
 */
import type { RedFlagRule } from "@setu/bank";
import { useEffect, useState } from "react";
import { api } from "../api";
import type { Ctx } from "../App";
import { ui } from "../i18n";
import { speak } from "../voice/speak";

export function RedFlagScreen({ ctx, rules }: { ctx: Ctx; rules: RedFlagRule[] }) {
  const { lang, voice, session } = ctx;
  const [staffView, setStaffView] = useState(false);
  const [name, setName] = useState("");
  useEffect(() => void speak(ui("showStaff", lang), lang, voice, "ui__showStaff"), [lang, voice]);

  async function acknowledgeAll() {
    for (const r of rules) await ctx.update(() => api.acknowledge(session.id, r.id, name.trim()));
  }

  if (!staffView)
    return (
      <main className="screen alert center">
        <h1>{ui("showStaff", lang)}</h1>
        <button className="secondary" onClick={() => setStaffView(true)}>
          {ui("iAmStaff", lang)}
        </button>
      </main>
    );

  return (
    <main className="screen alert" lang="en">
      <h1>Warning signs reported</h1>
      <ul className="flags">
        {rules.map((r) => (
          <li key={r.id}>
            {r.message}
            {!r.approved && <small> (draft rule, not yet clinically approved)</small>}
          </li>
        ))}
      </ul>
      <p>Assess the patient now. Follow the clinic's emergency protocol if needed.</p>
      <label className="field">
        <span>Your name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <button className="primary" disabled={!name.trim()} onClick={acknowledgeAll}>
        Seen. Continue the interview
      </button>
    </main>
  );
}
