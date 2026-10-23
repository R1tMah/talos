// Talos Improvements checkboxes: notesApi.setDone calls set_note_done and reports the result.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, announceWrite } = vi.hoisted(() => ({ rpc: vi.fn(), announceWrite: vi.fn() }));
vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({ rpc }) }));
vi.mock("@/lib/undo", () => ({ announceWrite, useDataChanged: () => {} }));

import { notesApi } from "@/lib/notesData";

describe("notesApi.setDone", () => {
  beforeEach(() => {
    rpc.mockReset();
    announceWrite.mockReset();
  });

  it.each([true, false])("sends done = %s for the note", async (done) => {
    rpc.mockResolvedValue({ data: { status: "saved", row: { id: "n1" }, action_id: "a1" }, error: null });
    expect(await notesApi.setDone("n1", done)).toEqual({ status: "saved", id: "n1" });
    expect(rpc).toHaveBeenCalledWith("set_note_done", { p_id: "n1", p_done: done });
  });

  it("announces the write so Undo offers it", async () => {
    rpc.mockResolvedValue({ data: { status: "saved", row: { id: "n1" }, action_id: "a1" }, error: null });
    await notesApi.setDone("n1", true);
    expect(announceWrite).toHaveBeenCalledWith("notes", expect.objectContaining({ action_id: "a1" }));
  });

  it("a deleted note is not_found", async () => {
    rpc.mockResolvedValue({ data: { status: "not_found" }, error: null });
    expect(await notesApi.setDone("gone", true)).toEqual({ status: "not_found" });
  });

  it("a missing database function (migration not applied) is failed", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function public.set_note_done" } });
    expect(await notesApi.setDone("n1", true)).toEqual({ status: "failed" });
  });
});
