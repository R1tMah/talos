"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { FullScreenEditor } from "@/components/Editor";
import { FormSheet } from "@/components/FormSheet";
import { PageSkeleton } from "@/components/Skeleton";
import { fmtDay } from "@/lib/date";
import { callbacksApi, useCallbackRow } from "@/lib/callbacksData";
import { CALLBACK_FIELDS, callbackOf, validateCallback } from "../fields";

/**
 * Debrief: plain free text, saved exactly as typed. Edits stay local while typing
 * and save on Done or when the app goes to the background, not on every keystroke.
 */
export default function DebriefPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { row, state, reload } = useCallbackRow(id);
  const [text, setText] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const [error, setError] = useState(false);
  const saved = useRef<string | null>(null);

  // Start from the stored text once it loads.
  useEffect(() => {
    if (row && text === null) {
      setText(row.debrief);
      saved.current = row.debrief;
    }
  }, [row, text]);

  const save = useCallback(async () => {
    if (text === null || text === saved.current) return true;
    const res = await callbacksApi.setDebrief(id, text);
    if (res.status !== "saved") {
      setError(true);
      return false;
    }
    saved.current = text;
    setError(false);
    return true;
  }, [id, text]);

  // iOS fires visibilitychange when switching apps or locking the phone.
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && save();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [save]);

  if (state === "missing" || state === "failed") {
    return (
      <main className="screen">
        <p className="faint">{state === "missing" ? "Not found." : "Failed."}</p>
      </main>
    );
  }
  if (!row || text === null) return <PageSkeleton />;

  return (
    <>
      <FullScreenEditor
        title={`${row.company}, ${row.kind}`}
        value={text}
        placeholder={`Debrief${row.date ? `, ${fmtDay(row.date)}` : ""}`}
        onChange={setText}
        onDone={async () => {
          // Stay on the page if the save failed, so nothing typed is lost.
          if (await save()) router.push("/tabs/recruiting?tab=callbacks");
        }}
        left={
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetails(true)}>
            Details
          </button>
        }
        right={error ? <span style={{ color: "var(--danger)", fontSize: "var(--t-sm)", alignSelf: "center" }}>Failed</span> : undefined}
      />
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
            if (res.status === "saved") router.push("/tabs/recruiting?tab=callbacks");
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
    </>
  );
}
