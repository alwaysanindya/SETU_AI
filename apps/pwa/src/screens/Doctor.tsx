/** The doctor's view (#/doctor): recent patients, and the one-page summary for each. */
import type { DoctorSummary, SummaryLine } from "@setu/engine";
import { useEffect, useState } from "react";
import { api, DEMO, type SessionListItem } from "../api";
import { loadSampleCase } from "../sample-case";

export function DoctorScreen({ sessionId }: { sessionId?: string }) {
  return sessionId ? <SummaryPage id={sessionId} /> : <SessionList />;
}

function SessionList() {
  const [items, setItems] = useState<SessionListItem[]>();
  const load = () => api.list().then(setItems, () => setItems([]));
  useEffect(() => {
    load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <main className="screen doctor" lang="en">
      <h1>🩺 Patients today</h1>
      {DEMO && (
        <button
          className="secondary"
          onClick={async () => {
            const id = await loadSampleCase();
            location.hash = `#/doctor/${id}`;
          }}
        >
          Load a sample patient (chest pain)
        </button>
      )}
      {!items ? (
        <p>Loading…</p>
      ) : items.length === 0 ? (
        <p className="hint">No interviews yet. Complete one in the patient app{DEMO ? ", or load the sample patient" : ""}.</p>
      ) : (
        <ul className="sessions">
          {items.map((s) => (
            <li key={s.id}>
              <a href={`#/doctor/${s.id}`}>
                <span className={`status ${s.redFlags > 0 ? "red" : s.confirmed ? "done" : "open"}`}>
                  {s.redFlags > 0 ? "Red flag" : s.confirmed ? "Complete" : "In progress"}
                </span>
                <strong>{[s.patient.ageYears !== undefined ? `${s.patient.ageYears} y` : "", s.patient.sex].filter(Boolean).join(", ")}</strong>
                <span>{s.complaints.join(", ") || "no complaint yet"}</span>
                <small>{new Date(s.updatedAt).toLocaleTimeString()}</small>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function Lines({ lines }: { lines: SummaryLine[] }) {
  if (lines.length === 0) return <p className="hint">Not recorded.</p>;
  return (
    <ul>
      {lines.map((l, i) => (
        <li key={i} title={l.question}>
          {l.text.charAt(0).toUpperCase() + l.text.slice(1)}
        </li>
      ))}
    </ul>
  );
}

function SummaryPage({ id }: { id: string }) {
  const [data, setData] = useState<{ summary: DoctorSummary; text: string } | null>();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    api.summary(id).then(setData, () => setData(null));
  }, [id]);
  if (data === undefined) return <main className="screen doctor">Loading…</main>;
  if (data === null) return <main className="screen doctor">Summary not found. <a href="#/doctor">← Patients</a></main>;
  const s = data.summary;
  const who = [s.patient.ageYears !== undefined ? `${s.patient.ageYears} years` : "", s.patient.sex].filter(Boolean).join(", ");

  return (
    <main className="screen doctor" lang="en">
      <nav className="row">
        <a href="#/doctor">← Patients</a>
        <span className="grow" />
        <button
          className="secondary"
          onClick={() => navigator.clipboard?.writeText(data.text).then(() => setCopied(true), () => setCopied(false))}
        >
          {copied ? "Copied ✓" : "Copy as text"}
        </button>
        <button className="secondary" onClick={() => window.print()}>
          Print
        </button>
      </nav>

      <header className="sum-head">
        <h1>History summary</h1>
        <p>
          {who || "Patient"} · {s.confirmed ? "confirmed by patient" : <span className="warn">not yet confirmed by patient</span>}
        </p>
      </header>

      {s.redFlags.length > 0 && (
        <section className="card alert-card">
          <h2>⚠ Red flags</h2>
          <ul>
            {s.redFlags.map((f) => (
              <li key={f.ruleId}>
                <strong>{f.message}</strong>
                {!f.approved && <small> · draft rule</small>}
                {f.acknowledgedBy && <small> · seen by {f.acknowledgedBy}</small>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {s.staffInstructions.length > 0 && (
        <section className="card alert-card">
          <h2>Staff instructions</h2>
          <ul>{s.staffInstructions.map((i) => <li key={i}>{i}</li>)}</ul>
        </section>
      )}

      <section className="card">
        <h2>1 · Presenting complaints</h2>
        <p className="hint">Patient-reported, not a diagnosis.</p>
        <table className="codes">
          <thead>
            <tr>
              <th>Complaint</th>
              <th>ICD-10 (WHO)</th>
              <th>SNOMED CT</th>
            </tr>
          </thead>
          <tbody>
            {s.codedComplaints.map((c) => (
              <tr key={c.complaintId}>
                <td>{c.name}</td>
                <td>
                  {c.codes?.icd10Who ? (
                    <>
                      <code>{c.codes.icd10Who.code}</code> {c.codes.icd10Who.display}
                    </>
                  ) : (
                    "—"
                  )}
                  {c.codes && !c.codes.verified && <span className="tag">draft</span>}
                </td>
                <td>{c.codes?.snomedCt ? <code>{c.codes.snomedCt.code}</code> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>2 · History of presenting complaints</h2>
        {s.complaintHistory.map((h) => (
          <p key={h.complaintId}>
            <strong>{h.name}:</strong> {h.text.slice(h.name.length + 1).trim() || "no details recorded."}
          </p>
        ))}
      </section>

      <section className="card">
        <h2>3 · Past medical history</h2>
        <Lines lines={s.pastHistory} />
      </section>

      <section className="card">
        <h2>4 · Personal history</h2>
        <Lines lines={s.personalHistory} />
      </section>

      {s.uncertain.length > 0 && (
        <section className="card">
          <h2>Please confirm with the patient</h2>
          <p className="hint">Spoken answers the system was not fully sure about.</p>
          <ul>
            {s.uncertain.map((u) => (
              <li key={`${u.scope}/${u.questionId}`}>
                {u.question}: recorded <strong>{u.recordedAs}</strong>
                {u.heard && <> (heard “{u.heard}”)</>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="hint small">Question bank {s.bankVersion}. Generated from the patient's answers; review before use.</p>
    </main>
  );
}
