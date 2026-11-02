/** The doctor's view (#/doctor): recent patients, and the one-page summary for each. */
import { useEffect, useState } from "react";
import { api, type SessionListItem } from "../api";

export function DoctorScreen({ sessionId }: { sessionId?: string }) {
  return sessionId ? <SummaryPage id={sessionId} /> : <SessionList />;
}

function SessionList() {
  const [items, setItems] = useState<SessionListItem[]>();
  useEffect(() => {
    const load = () => api.list().then(setItems, () => setItems([]));
    load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <main className="screen doctor" lang="en">
      <h1>Patients</h1>
      {!items ? (
        <p>Loading…</p>
      ) : items.length === 0 ? (
        <p>No interviews yet.</p>
      ) : (
        <ul className="sessions">
          {items.map((s) => (
            <li key={s.id}>
              <a href={`#/doctor/${s.id}`}>
                {s.redFlags > 0 && <strong className="flag">! </strong>}
                {[s.patient.ageYears !== undefined ? `${s.patient.ageYears} y` : "", s.patient.sex].filter(Boolean).join(", ")} ·{" "}
                {s.complaints.join(", ") || "no complaint yet"} · {s.confirmed ? "complete" : "in progress"} ·{" "}
                {new Date(s.updatedAt).toLocaleTimeString()}
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function SummaryPage({ id }: { id: string }) {
  const [text, setText] = useState<string>();
  useEffect(() => {
    api.summary(id).then((r) => setText(r.text), () => setText("Summary not found."));
  }, [id]);
  return (
    <main className="screen doctor" lang="en">
      <a href="#/doctor">← Patients</a>
      <pre className="summary">{text ?? "Loading…"}</pre>
      <button className="secondary" onClick={() => text && navigator.clipboard.writeText(text)}>
        Copy
      </button>
      <button className="secondary" onClick={() => window.print()}>
        Print
      </button>
    </main>
  );
}
