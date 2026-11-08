"use client";

// Import from Liftoff, on the Lifts tab: paste the CSV (or pick the exported file), see what
// it holds, then Import. Same parser and checks as pasting into Chat (lib/liftoff.ts).

import { useEffect, useState } from "react";
import { fmtDay } from "@/lib/date";
import { importSummary, parseLiftoff, sessionKey, type ParseResult } from "@/lib/liftoff";
import { alreadyImported, importSets } from "@/lib/liftoffData";
import { Sheet } from "./FormSheet";

export function LiftoffImport({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [replaced, setReplaced] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-check as the text changes (a moment after typing stops).
  useEffect(() => {
    if (!text.trim()) return void (setParsed(null), setReplaced(null));
    const t = setTimeout(async () => {
      const p = parseLiftoff(text);
      setParsed(p);
      setReplaced(p.errors.length ? null : await alreadyImported([...new Set(p.sets.map(sessionKey))]));
    }, 250);
    return () => clearTimeout(t);
  }, [text]);

  const ok = parsed && !parsed.errors.length && parsed.sets.length > 0;
  const sum = ok ? importSummary(parsed.sets, replaced ?? 0, fmtDay) : null;

  return (
    <Sheet title="Import from Liftoff" onClose={onClose}>
      <p className="faint" style={{ fontSize: "var(--t-sm)", margin: "0 0 var(--s-2)" }}>
        In Liftoff, export your workouts as CSV. Paste the text here or choose the file. Workouts already imported are replaced, so overlapping exports are fine.
      </p>
      <label className="input file-pick" style={{ marginBottom: "var(--s-2)" }}>
        <span className="btn btn-sm">Choose CSV</span>
        <span className={`file-pick-name${fileName ? "" : " faint"}`}>{fileName ?? "or paste below"}</span>
        <input
          className="visually-hidden"
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setFileName(f.name);
            setText(await f.text());
          }}
        />
      </label>
      <textarea
        className="input"
        rows={6}
        value={text}
        placeholder="Date,Duration,Workout Name,Exercise Name,Set Order,Weight,Reps,…"
        onChange={(e) => {
          setFileName(null);
          setText(e.target.value);
        }}
        style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: "var(--t-xs)" }}
      />

      {parsed?.errors.length ? (
        <div role="alert" className="liftoff-errors">
          <strong>Nothing can be imported yet.</strong>
          <ul>
            {parsed.errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}
          </ul>
          {parsed.errors.length > 8 && <span>And {parsed.errors.length - 8} more.</span>}
        </div>
      ) : sum ? (
        <p className="num" style={{ fontSize: "var(--t-sm)", margin: "var(--s-2) 0 0" }}>
          {replaced == null ? "Checking…" : sum.text}
        </p>
      ) : null}
      {error && <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--t-sm)" }}>{error}</p>}

      <div className="sheet-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!ok || busy || replaced == null}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const r = await importSets(parsed!.sets);
            setBusy(false);
            if (!r.ok) return setError(r.error);
            onDone(`Imported ${r.sessions} ${r.sessions === 1 ? "workout" : "workouts"}, ${r.sets} sets${r.replaced ? ` (${r.replaced} replaced)` : ""}.`);
          }}
        >
          {busy ? "Importing…" : sum ? `Import ${sum.workouts} ${sum.workouts === 1 ? "workout" : "workouts"}` : "Import"}
        </button>
      </div>
    </Sheet>
  );
}
