// A typed answer to "Where does this go?" that names a tab sends the message there.

import { describe, expect, it } from "vitest";
import { tabFromReply } from "@/lib/tabs";

describe("tabFromReply", () => {
  it("matches a tab by name, key or alias, ignoring case and punctuation", () => {
    expect(tabFromReply("weight")).toBe("weight");
    expect(tabFromReply("Work Journal.")).toBe("journal");
    expect(tabFromReply("food")).toBe("nutrition");
    expect(tabFromReply("LC")).toBe("leetcode");
    expect(tabFromReply("Talos Improvements")).toBe("talos");
  });

  it("allows a short lead-in and a trailing 'tab'", () => {
    expect(tabFromReply("it goes in the nutrition tab")).toBe("nutrition");
    expect(tabFromReply("put it in runs")).toBe("runs");
    expect(tabFromReply("to personal")).toBe("personal");
  });

  it("leaves anything else as an ordinary message", () => {
    expect(tabFromReply("168 weight")).toBeNull();
    expect(tabFromReply("ran 3 miles")).toBeNull();
    expect(tabFromReply("")).toBeNull();
  });
});
