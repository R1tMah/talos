"use client";

// Future Letters: write to yourself, seal it, and read it when it unlocks. Sealed letters
// show only their dates; the database never sends their text here (lib/lettersData.ts).
// "Hide text" makes the box show nothing but a character count, for pasting old letters
// in without reading them.

import { useState } from "react";
import { PageSkeleton } from "@/components/Skeleton";
import { ScreenHeader, SectionTitle } from "@/components/ui";
import { fmtNum, toISO, todayISO } from "@/lib/date";
import { postponeProblem, sealProblem, stripFutureMeChrome, unlockAt, untilText, writtenAt } from "@/lib/letters";
import { lettersApi, useLetters, type OpenedLetter, type SealedLetter } from "@/lib/lettersData";
import { showToast } from "@/lib/undo";

const fmtDate = (iso: string | Date) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
const fmtWhen = (iso: string | Date) =>
  `${fmtDate(iso)} at ${new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;

export default function LettersPage() {
  const { sealed, opened, failed, reload } = useLetters();

  return (
    <main className="screen">
      <ScreenHeader title="Future Letters" back="/tabs" />
      <Composer onSealed={reload} />
      {failed ? (
        <p role="alert" className="muted">Failed to load your letters.</p>
      ) : !sealed || !opened ? (
        <PageSkeleton />
      ) : (
        <>
          <SectionTitle>Sealed ({sealed.length})</SectionTitle>
          {sealed.length ? (
            <section className="card list">
              {sealed.map((l) => <SealedRow key={l.id} l={l} onChange={reload} />)}
            </section>
          ) : (
            <p className="muted">No sealed letters.</p>
          )}

          <SectionTitle>Opened ({opened.length})</SectionTitle>
          {opened.length ? (
            opened.map((l) => <OpenedLetterCard key={l.id} l={l} onChange={reload} />)
          ) : (
            <p className="muted">Nothing has unlocked yet.</p>
          )}
        </>
      )}
    </main>
  );
}

function Composer({ onSealed }: { onSealed: () => void }) {
  const [body, setBody] = useState("");
  const [deliverDate, setDeliverDate] = useState("");
  const [writtenDate, setWrittenDate] = useState("");
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  const seal = async () => {
    const now = new Date();
    const input = { body, deliverDate, writtenDate: writtenDate || null };
    const why = sealProblem(input, now);
    if (why) return setProblem(why);
    // The text leaves the screen before anything else happens. A pasted FutureMe page
    // loses the page around the letter (share panel, footer) on the way.
    const text = stripFutureMeChrome(body);
    setBody("");
    setProblem("");
    setBusy(true);
    const opens = unlockAt(deliverDate, now);
    const err = await lettersApi.seal(text, opens, writtenAt(input.writtenDate, now));
    setBusy(false);
    if (err) {
      // Put it back so nothing is lost, still hidden if it was.
      setBody(text);
      return setProblem(err);
    }
    setDeliverDate("");
    setWrittenDate("");
    showToast({ text: `Sealed. Unlocks ${fmtWhen(opens)}.`, tone: "ok" });
    onSealed();
  };

  return (
    <section className="card letter-composer">
      <textarea
        className={`input letter-text${hidden ? " letter-hidden" : ""}`}
        rows={12}
        placeholder={hidden ? "Paste here. The text stays hidden." : "Dear future me…"}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label="Letter"
        spellCheck={!hidden}
      />
      <div className="letter-meta">
        <span className="faint num">{body ? `${fmtNum(body.length)} characters${hidden ? ", hidden" : ""}` : " "}</span>
        <label className="letter-hide">
          <span>Hide text</span>
          <button type="button" role="switch" className="switch" aria-checked={hidden} aria-label="Hide text" onClick={() => setHidden(!hidden)} />
        </label>
      </div>
      <label className="letter-field">
        <span className="label">Unlocks on</span>
        <input className="input" type="date" min={todayISO()} value={deliverDate} onChange={(e) => setDeliverDate(e.target.value)} />
      </label>
      <label className="letter-field">
        <span className="label">Written on (for a letter you&rsquo;re bringing over)</span>
        <input className="input" type="date" max={todayISO()} value={writtenDate} onChange={(e) => setWrittenDate(e.target.value)} />
      </label>
      <p className="faint letter-note">
        It unlocks at this time of day on that date, opens here, and is emailed to you. Until then only its dates are shown.
      </p>
      {problem && <p role="alert" className="letter-problem">{problem}</p>}
      <button type="button" className="btn btn-primary" onClick={seal} disabled={busy}>
        {busy ? "Sealing…" : "Seal letter"}
      </button>
    </section>
  );
}

function SealedRow({ l, onChange }: { l: SealedLetter; onChange: () => void }) {
  const [moving, setMoving] = useState(false);
  const [date, setDate] = useState("");
  const [problem, setProblem] = useState("");
  const current = new Date(l.deliverAt);

  const postpone = async () => {
    const why = postponeProblem(current, date);
    if (why) return setProblem(why);
    const err = await lettersApi.postpone(l.id, unlockAt(date, current));
    if (err) return setProblem(err);
    setMoving(false);
    onChange();
  };
  const remove = async () => {
    if (!window.confirm("Delete this sealed letter? It can't be recovered, and you won't see what it said.")) return;
    if (await lettersApi.remove(l.id)) onChange();
    else showToast({ text: "Couldn't delete it.", tone: "error" });
  };

  return (
    <div className="letter-row">
      <span className="letter-env" aria-hidden>✉</span>
      <div className="letter-row-main">
        <span className="num">Unlocks {fmtWhen(l.deliverAt)}</span>
        <span className="faint num letter-sub">
          {untilText(current)} · written {fmtDate(l.writtenAt)}
        </span>
        {moving && (
          <div className="letter-move">
            <input className="input" type="date" min={toISO(current)} value={date} onChange={(e) => setDate(e.target.value)} aria-label="New unlock date" />
            <button type="button" className="btn btn-sm btn-primary" onClick={postpone}>Save</button>
            <button type="button" className="btn btn-sm" onClick={() => { setMoving(false); setProblem(""); }}>Cancel</button>
            {problem && <span role="alert" className="letter-problem">{problem}</span>}
          </div>
        )}
      </div>
      {!moving && (
        <div className="letter-actions">
          <button type="button" className="btn btn-sm" onClick={() => { setDate(""); setMoving(true); }}>Postpone</button>
          <button type="button" className="btn btn-sm" onClick={remove} aria-label="Delete sealed letter">Delete</button>
        </div>
      )}
    </div>
  );
}

function OpenedLetterCard({ l, onChange }: { l: OpenedLetter; onChange: () => void }) {
  const remove = async () => {
    if (!window.confirm("Delete this letter for good?")) return;
    if (await lettersApi.remove(l.id)) onChange();
    else showToast({ text: "Couldn't delete it.", tone: "error" });
  };
  return (
    <details className="card letter-open">
      <summary>
        <span className="letter-env open" aria-hidden>✉</span>
        <span className="letter-row-main">
          <span>Written {fmtDate(l.writtenAt)}</span>
          <span className="faint num letter-sub">Opened {fmtDate(l.openedAt)}</span>
        </span>
      </summary>
      <div className="letter-body">{l.body}</div>
      <div className="letter-meta">
        <span className={l.emailError && !l.emailedAt ? "letter-problem" : "faint"}>
          {l.emailedAt ? "Emailed to you" : l.emailError ? `Email failed: ${l.emailError} Trying again every 15 minutes.` : "Emailing soon"}
        </span>
        <button type="button" className="btn btn-sm" onClick={remove}>Delete</button>
      </div>
    </details>
  );
}
