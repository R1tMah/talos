"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FullScreenEditor } from "@/components/Editor";
import { FormSheet } from "@/components/FormSheet";
import { PageSkeleton } from "@/components/Skeleton";
import { ScreenHeader, SectionTitle, StatusPill } from "@/components/ui";
import { fmtDay, toHM, toISO } from "@/lib/date";
import {
  buildTree, callbacksApi, useCallbackRow, useCallbackThread, type Callback, type UpdateNode, type WriteResult,
} from "@/lib/callbacksData";
import { CALLBACK_FIELDS, callbackOf, validateCallback } from "../fields";

const LIST = "/tabs/recruiting?tab=callbacks";

/** "Nov 3, 14:05" */
const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${fmtDay(toISO(d))}, ${toHM(d)}`;
};

/**
 * A callback as a thread: the callback and its debrief are the post, updates are
 * comments under it, and any update can be replied to. Text is saved exactly as typed.
 */
export default function CallbackThreadPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { row, state, reload } = useCallbackRow(id);
  const thread = useCallbackThread(id);
  const [details, setDetails] = useState(false);
  const [debrief, setDebrief] = useState(false);
  const [error, setError] = useState(false);

  const tree = useMemo(() => buildTree(thread.updates ?? []), [thread.updates]);
  const total = tree.reduce((t, n) => t + n.count, 0);

  /** Runs a write and reloads the thread. False (and a "Failed" note) on anything but success. */
  const run = async (write: Promise<WriteResult>) => {
    const res = await write;
    setError(res.status !== "saved");
    await thread.reload();
    return res.status === "saved";
  };

  if (state === "missing" || state === "failed") {
    return (
      <main className="screen">
        <ScreenHeader title="Callback" back={LIST} />
        <p className="faint">{state === "missing" ? "Not found." : "Failed."}</p>
      </main>
    );
  }
  if (!row) return <PageSkeleton />;

  if (debrief) return <DebriefEditor row={row} onDone={() => (setDebrief(false), reload())} />;

  return (
    <main className="screen">
      <ScreenHeader
        title={row.company}
        back={LIST}
        right={
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetails(true)}>
            Details
          </button>
        }
      />

      <section className="card pad cb-post">
        <div className="cb-post-meta">
          <span className="muted">
            {row.kind}
            {row.score && <span className="num"> · {row.score}</span>}
            {row.date && <span> · {fmtDay(row.date)}</span>}
          </span>
          {row.outcome && <StatusPill status={row.outcome} />}
        </div>
        <button type="button" className="cb-debrief" onClick={() => setDebrief(true)} aria-label="Edit debrief">
          {row.debrief.trim() ? row.debrief : <span className="faint">No debrief yet. Tap to write one.</span>}
        </button>
      </section>

      {error && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--t-sm)", margin: 0 }}>
          Failed
        </p>
      )}

      <Composer placeholder="Add an update…" submitLabel="Post" onSubmit={(body) => run(callbacksApi.addUpdate(row.id, body))} />

      <SectionTitle>Updates{total ? ` (${total})` : ""}</SectionTitle>
      {thread.failed && !thread.updates ? (
        <p role="alert" className="muted">
          Failed to load updates.{" "}
          <button type="button" className="btn btn-sm" onClick={thread.reload}>
            Retry
          </button>
        </p>
      ) : !thread.updates ? (
        <p className="faint">Loading…</p>
      ) : tree.length === 0 ? (
        <p className="faint">No updates yet.</p>
      ) : (
        <div className="cb-thread">
          {tree.map((n) => (
            <Comment key={n.id} node={n} callbackId={row.id} run={run} />
          ))}
        </div>
      )}

      {details && (
        <FormSheet
          title="Callback details"
          fields={CALLBACK_FIELDS}
          confirm
          validate={validateCallback}
          initial={row}
          onClose={() => setDetails(false)}
          onDelete={async () => {
            const res = await callbacksApi.remove(row.id);
            if (res.status === "saved") router.push(LIST);
            else setError(true);
          }}
          onSubmit={async (v) => {
            setDetails(false);
            const res = await callbacksApi.update(row.id, callbackOf(v));
            setError(res.status !== "saved");
            reload();
          }}
        />
      )}
    </main>
  );
}

/** One update, its actions, and its replies. The rail on the left collapses the subtree. */
function Comment({
  node, callbackId, run,
}: {
  node: UpdateNode;
  callbackId: string;
  run: (w: Promise<WriteResult>) => Promise<boolean>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mode, setMode] = useState<"reply" | "edit" | null>(null);
  const hidden = node.count - (node.deleted ? 0 : 1);

  return (
    <div className="cb-comment">
      <button
        type="button"
        className="cb-rail"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? "Expand thread" : "Collapse thread"}
        aria-expanded={!collapsed}
      />
      <div className="cb-comment-main">
        <div className="cb-meta">
          <span>{stamp(node.createdAt)}</span>
          {node.edited && !node.deleted && <span> · edited</span>}
          {collapsed && hidden > 0 && (
            <button type="button" className="cb-more" onClick={() => setCollapsed(false)}>
              +{hidden} {hidden === 1 ? "reply" : "replies"}
            </button>
          )}
        </div>

        {!collapsed && (
          <>
            {node.deleted ? (
              <p className="cb-body faint">[deleted]</p>
            ) : mode === "edit" ? (
              <Composer
                initial={node.body}
                submitLabel="Save"
                autoFocus
                onCancel={() => setMode(null)}
                onSubmit={async (body) => {
                  const ok = await run(callbacksApi.editUpdate(node.id, body));
                  if (ok) setMode(null);
                  return ok;
                }}
              />
            ) : (
              <p className="cb-body">{node.body}</p>
            )}

            {!node.deleted && mode !== "edit" && (
              <div className="cb-actions">
                <button type="button" onClick={() => setMode(mode === "reply" ? null : "reply")}>Reply</button>
                <button type="button" onClick={() => setMode("edit")}>Edit</button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(hidden ? "Delete this update? Its replies stay." : "Delete this update?")) run(callbacksApi.removeUpdate(node.id));
                  }}
                >
                  Delete
                </button>
              </div>
            )}

            {mode === "reply" && (
              <Composer
                placeholder="Reply…"
                submitLabel="Reply"
                autoFocus
                onCancel={() => setMode(null)}
                onSubmit={async (body) => {
                  const ok = await run(callbacksApi.addUpdate(callbackId, body, node.id));
                  if (ok) setMode(null);
                  return ok;
                }}
              />
            )}

            {node.replies.length > 0 && (
              <div className="cb-replies">
                {node.replies.map((r) => (
                  <Comment key={r.id} node={r} callbackId={callbackId} run={run} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Textarea plus submit. Clears itself after a successful post; keeps the text if it failed. */
function Composer({
  initial = "", placeholder, submitLabel, onSubmit, onCancel, autoFocus,
}: {
  initial?: string;
  placeholder?: string;
  submitLabel: string;
  onSubmit: (body: string) => Promise<boolean>;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const blank = !text.trim();

  const submit = async () => {
    if (blank || busy) return;
    setBusy(true);
    const ok = await onSubmit(text);
    setBusy(false);
    if (ok && !initial) setText("");
  };

  return (
    <div className="cb-composer">
      <textarea
        className="input"
        rows={2}
        value={text}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        // Cmd/Ctrl+Enter posts from a keyboard.
        onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && submit()}
        spellCheck
        autoCapitalize="sentences"
      />
      <div className="cb-composer-bar">
        {onCancel && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="button" className="btn btn-primary btn-sm" disabled={blank || busy} onClick={submit}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * The debrief, full screen. Edits stay local while typing and save on Done or when the
 * app goes to the background, not on every keystroke.
 */
function DebriefEditor({ row, onDone }: { row: Callback; onDone: () => void }) {
  const [text, setText] = useState(row.debrief);
  const [error, setError] = useState(false);
  const saved = useRef(row.debrief);

  const save = useCallback(async () => {
    if (text === saved.current) return true;
    const res = await callbacksApi.setDebrief(row.id, text);
    if (res.status !== "saved") {
      setError(true);
      return false;
    }
    saved.current = text;
    setError(false);
    return true;
  }, [row.id, text]);

  // iOS fires visibilitychange when switching apps or locking the phone.
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && save();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [save]);

  return (
    <FullScreenEditor
      title={`${row.company}, ${row.kind}`}
      value={text}
      placeholder={`Debrief${row.date ? `, ${fmtDay(row.date)}` : ""}`}
      onChange={setText}
      // Stay in the editor if the save failed, so nothing typed is lost.
      onDone={async () => (await save()) && onDone()}
      right={error ? <span style={{ color: "var(--danger)", fontSize: "var(--t-sm)", alignSelf: "center" }}>Failed</span> : undefined}
    />
  );
}
