"use client";

import { useState } from "react";
import { Sheet } from "@/components/FormSheet";
import { ScreenHeader } from "@/components/ui";
import { setTabArchived, useArchivedTabs } from "@/lib/archivedTabs";
import { ARCHIVABLE, type TabKey } from "@/lib/tabs";

/** Settings > Tabs: show or archive each tab. Archiving asks first. */
export default function TabsSettingsPage() {
  const archived = useArchivedTabs();
  const [archiving, setArchiving] = useState<{ tab: TabKey; label: string; archive: boolean } | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  return (
    <main className="screen">
      <ScreenHeader title="Tabs" back="/settings" />
      {notice && (
        <p role="status" style={{ color: notice.ok ? "var(--accent)" : "var(--danger)", fontSize: "var(--t-sm)", margin: 0 }}>
          {notice.text}
        </p>
      )}
      <div className="card list">
        {ARCHIVABLE.map((t) => {
          const on = !archived?.has(t.key);
          return (
            <div key={t.key} className="row">
              <span className="row-label">{t.label}</span>
              <span className="row-value">{on ? "Shown" : "Archived"}</span>
              <button
                type="button"
                role="switch"
                className="switch"
                aria-checked={on}
                aria-label={`${t.label} shown`}
                disabled={!archived}
                onClick={() => setArchiving({ tab: t.key, label: t.label, archive: on })}
              />
            </div>
          );
        })}
      </div>
      <p className="faint" style={{ fontSize: "var(--t-xs)", margin: "calc(-1 * var(--s-2)) var(--s-4) 0" }}>
        Archived tabs move to the bottom of Tabs and chat won&rsquo;t log to them. Weight and Nutrition always stay.
      </p>

      {archiving && (
        <Sheet title={`${archiving.archive ? "Archive" : "Unarchive"} ${archiving.label}?`} onClose={() => setArchiving(null)}>
          <p className="muted" style={{ fontSize: "var(--t-sm)", margin: 0 }}>
            {archiving.archive
              ? "It moves to Archived at the bottom of Tabs and chat won't log to it. Your data stays."
              : "It goes back on Tabs and chat logs to it again."}
          </p>
          <div className="sheet-actions">
            <button type="button" className="btn" onClick={() => setArchiving(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                const a = archiving;
                setArchiving(null);
                const ok = await setTabArchived(a.tab, a.archive);
                setNotice(ok ? { text: `${a.label} ${a.archive ? "archived" : "unarchived"}.`, ok: true } : { text: "Failed", ok: false });
              }}
            >
              {archiving.archive ? "Archive" : "Unarchive"}
            </button>
          </div>
        </Sheet>
      )}
    </main>
  );
}
