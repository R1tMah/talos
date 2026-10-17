"use client";

import { useState } from "react";
import { setTabArchived, useArchivedTabs } from "@/lib/archivedTabs";
import { tabLabel, type TabKey } from "@/lib/tabs";
import { showToast } from "@/lib/undo";
import { Sheet } from "./FormSheet";
import { IconArchive } from "./Icons";

/** Header button: archive this tab (confirmed first). Hidden while it's archived. */
export function ArchiveButton({ tab }: { tab: TabKey }) {
  const archived = useArchivedTabs();
  const [asking, setAsking] = useState(false);
  if (!archived || archived.has(tab)) return null;
  const label = tabLabel(tab);

  return (
    <>
      <button type="button" className="icon-btn" aria-label={`Archive ${label}`} onClick={() => setAsking(true)}>
        <IconArchive />
      </button>
      {asking && (
        <Sheet title={`Archive ${label}?`} onClose={() => setAsking(false)}>
          <p className="muted" style={{ fontSize: "var(--t-sm)", margin: 0 }}>
            It moves to Archived at the bottom of Tabs and chat won&rsquo;t log to it. Your data stays.
          </p>
          <div className="sheet-actions">
            <button type="button" className="btn" onClick={() => setAsking(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                setAsking(false);
                if (!(await setTabArchived(tab, true))) showToast({ text: "Failed", tone: "error" });
              }}
            >
              Archive
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

/** Slim bar at the top of an archived tab, with Unarchive. Renders nothing otherwise. */
export function ArchivedBar({ tab }: { tab: TabKey }) {
  const archived = useArchivedTabs();
  if (!archived?.has(tab)) return null;
  return (
    <div className="card archived-bar" role="status">
      <span className="muted">Archived</span>
      <button
        type="button"
        className="btn btn-sm"
        onClick={async () => {
          if (!(await setTabArchived(tab, false))) showToast({ text: "Failed", tone: "error" });
        }}
      >
        Unarchive
      </button>
    </div>
  );
}
