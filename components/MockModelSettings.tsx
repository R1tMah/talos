"use client";

// Settings > Behavioral mocks: which model writes the questions (Architect) and which
// grades the answers (Grader). Defaults: Sonnet 5.5 and Haiku 5.5.

import { MOCK_MODELS, type MockModel } from "@/lib/mock/score";
import { useMockModels } from "@/lib/mock/data";

const ROLES = [
  { key: "architect", label: "Question writer", hint: "Reads the job and writes the mock's questions + rubrics" },
  { key: "grader", label: "Grader", hint: "Grades each answer" },
] as const;

export function MockModelSettings() {
  const { models, failed, save } = useMockModels();
  return (
    <>
      <span className="label group-title">Behavioral mocks</span>
      <div className="card list">
        {ROLES.map((r) => (
          <label key={r.key} className="row">
            <span className="row-label">
              {r.label}
              <span className="cell-sub">{r.hint}</span>
            </span>
            <select
              className="row-select"
              value={models?.[r.key] ?? ""}
              disabled={!models}
              aria-label={`${r.label} model`}
              onChange={(e) => models && save({ ...models, [r.key]: e.target.value as MockModel })}
            >
              {!models && <option value="">–</option>}
              {MOCK_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
        ))}
      </div>
      <p className="faint" style={{ fontSize: "var(--t-xs)", margin: "calc(-1 * var(--s-2)) var(--s-4) 0" }}>
        {failed ? "Couldn't load or save these. " : ""}Bigger models cost more per question (Settings › API usage shows the spend).
      </p>
    </>
  );
}
