// Tests from the plan whose feature doesn't exist yet, or where the build made a
// different call. Each is a todo naming why, so `npm test` keeps listing them until
// they're implemented. Move a test out of here when its feature lands.

import { describe, it } from "vitest";

describe("Not built yet", () => {
  describe("1. Logical day", () => {
    it.todo('#4 "last Tuesday" resolves to the most recent Tuesday (no weekday hint; only days_ago exists)');
  });

  describe("2. Validation", () => {
    it.todo("#14 a set over 1,000 lb or 100 reps triggers a warning (no set range check yet)");
  });

  describe("4. Weekly averages", () => {
    it.todo("#29 only the current week is marked partial (the Weight tab marks every week with fewer than 7 days)");
  });

  describe("5. Nutrition", () => {
    it.todo('#41 "200g chicken" stores amount 200 with unit g (foods are logged by servings, not grams)');
    it.todo('#42 a photo estimate saves with source photo_estimate and an "estimate" label (photos removed: no estimates)');
    it.todo('#43 "Save as food" after a photo estimate (photos removed)');
  });

  describe("7. Applications", () => {
    it.todo("#59 the Applications table sorts by applied date then entry time (UI order not covered by tests)");
    it.todo("#60 status counts at the top match the rows (UI not covered by tests)");
  });

  describe("9. Workout and rest timer", () => {
    it.todo('#72 "bench 3x8 at 155" in chat logs three sets of 8 at 155 (chat workout tools not built)');
    it.todo('#73 "bench 8 at 155" logs one set (chat workout tools not built)');
    it.todo('#74 "hanging leg raises 15" logs one bodyweight set (chat workout tools not built)');
    it.todo('#75 "cable fly" / "machine chest fly" resolve to Chest fly with the variant (chat parsing not built; aliases exist)');
    it.todo("#77 a set typed in main Chat while a workout is active routes to it (chat workout tools not built)");
    it.todo("#78 the rest timer starts only after a set saves (component behavior; no UI tests)");
    it.todo('#80 changing rest time by chat applies to the next set (settings tool not built)');
    it.todo("#85 the manual set form starts the rest timer (component behavior; no UI tests)");
  });

  describe("10. Notes", () => {
    it.todo('#90 an unmapped message saved via "Save as note" lands in the inbox kind (no inbox kind)');
  });

  describe("11. Settings and phases", () => {
    it.todo('#91 "switch my calories to 2300" shows old to new and requires Confirm (settings tool not built)');
    it.todo("#92 confirming closes the current phase and opens a new one dated today");
    it.todo("#93 cancelling changes nothing");
    it.todo('#94 "set rest to 3 minutes" updates rest_seconds to 180');
    it.todo("#95 changing a target never modifies old phases or past entries");
  });

  describe("12. Pre-routing rules", () => {
    it.todo("#97 a set pattern during an active workout routes by rule (chat workout tools not built)");
  });

  describe("13. Model contract", () => {
    it.todo("#106 a photo message selects the vision model (photos removed)");
  });

  describe("14. Confidence and pipeline", () => {
    it.todo('#113 "Save as note" always appears on the unmapped card (removed with the inbox)');
  });

  describe("16. Soft delete and idempotency", () => {
    it.todo("#126 deleting by chat requires Confirm and sets deleted_at (delete tool not built)");
    it.todo("#129 the same text sent twice within seconds is deduped (dedupe is by client_msg_id only)");
  });

  describe("17. Query tools (none built)", () => {
    it.todo('#131 "How many interviews so far?" returns the count from the database');
    it.todo('#132 "What\'s in my redo queue?" returns the queue rows');
    it.todo("#133 lifts_per_week counts distinct workout days per Monday-to-Sunday week");
    it.todo("#134 query tools cannot write (read-only role)");
    it.todo("#135 query_entries rejects tables or columns not on the allow-list");
    it.todo("#136 the app renders query results; no model text appears");
  });

  describe("18. Export and backup (review packet and JSON backup not built)", () => {
    it.todo("#137 the packet has the context blurb, targets, phases, computed numbers and verbatim debriefs");
    it.todo("#138 weight notes are excluded by default and included only when toggled");
    it.todo("#139 date range and tab selection filter correctly");
    it.todo("#140 summary mode is shorter than full mode and omits raw rows");
    it.todo("#141 the packet is built without any model call");
    it.todo("#142 the backup includes every table, including soft-deleted rows, as valid JSON");
    it.todo("#143 a large backup paginates without timing out");
  });

  describe("20. Import", () => {
    it.todo(
      "#156 Capital One and Scale AI callbacks have no application link and are flagged " +
        "(superseded: applications were imported later, so Capital One is now linked to its one application; Scale AI has two and stays unlinked)",
    );
  });
});
