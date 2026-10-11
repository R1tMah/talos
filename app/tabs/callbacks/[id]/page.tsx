"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { FullScreenEditor } from "@/components/Editor";
import { FormSheet } from "@/components/FormSheet";
import { fmtDay } from "@/lib/date";
import { useStore } from "@/lib/store";
import type { Callback } from "@/lib/types";
import { CALLBACK_FIELDS } from "../fields";

/** Debrief: plain free text, saved as typed. */
export default function DebriefPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { db, update, remove } = useStore();
  const [details, setDetails] = useState(false);
  const cb = db.callbacks.find((c) => c.id === id && !c.deleted);

  if (!cb) {
    return (
      <main className="screen">
        <p className="faint">Not found.</p>
      </main>
    );
  }

  return (
    <>
      <FullScreenEditor
        title={`${cb.company}, ${cb.type}`}
        value={cb.debrief}
        placeholder={`Debrief, ${fmtDay(cb.date)}`}
        onChange={(debrief) => update("callbacks", cb.id, { debrief })}
        onDone={() => router.push("/tabs/callbacks")}
        left={
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetails(true)}>
            Details
          </button>
        }
      />
      {details && (
        <FormSheet
          title="Callback details"
          fields={CALLBACK_FIELDS}
          confirm
          initial={cb}
          onClose={() => setDetails(false)}
          onDelete={() => {
            remove("callbacks", cb.id);
            router.push("/tabs/callbacks");
          }}
          onSubmit={(v) => {
            update("callbacks", cb.id, v as Partial<Callback>);
            setDetails(false);
          }}
        />
      )}
    </>
  );
}
