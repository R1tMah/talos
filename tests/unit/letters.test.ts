import { describe, expect, it } from "vitest";
import { renderLetter } from "@/lib/email/letter";
import { postponeProblem, sealProblem, stripFutureMeChrome, unlockAt, untilText, writtenAt } from "@/lib/letters";

const now = new Date(2026, 10, 6, 22, 32, 15); // Nov 6, 10:32:15 PM

describe("Future letters: when they unlock", () => {
  it("unlocks on its date at the time of day it was sealed", () => {
    expect(unlockAt("2027-11-06", now)).toEqual(new Date(2027, 10, 6, 22, 32, 15));
  });

  it("dates an imported letter on its day, never in the future", () => {
    expect(writtenAt("2024-01-01", now)).toEqual(new Date(2024, 0, 1, 22, 32, 15));
    expect(writtenAt(null, now)).toBe(now);
  });

  it("only seals letters that unlock later", () => {
    const ok = { body: "hi", deliverDate: "2026-11-07", writtenDate: null };
    expect(sealProblem(ok, now)).toBeNull();
    // Same day: the unlock time is now, which isn't later.
    expect(sealProblem({ ...ok, deliverDate: "2026-11-06" }, now)).toMatch(/later date/);
    expect(sealProblem({ ...ok, deliverDate: "2026-11-01" }, now)).toMatch(/later date/);
    expect(sealProblem({ ...ok, body: "   " }, now)).toMatch(/empty/);
    expect(sealProblem({ ...ok, deliverDate: "" }, now)).toMatch(/Pick when/);
  });

  it("postpones, never brings forward", () => {
    const at = new Date(2027, 0, 1, 9, 0);
    expect(postponeProblem(at, "2027-02-01")).toBeNull();
    expect(postponeProblem(at, "2027-01-01")).toMatch(/later/);
    expect(postponeProblem(at, "2026-12-31")).toMatch(/later/);
    expect(postponeProblem(at, "")).toMatch(/Pick/);
  });

  it("says how far off a letter is", () => {
    const d = (days: number) => new Date(now.getTime() + days * 86_400_000);
    expect(untilText(d(1), now)).toBe("tomorrow");
    expect(untilText(d(10), now)).toBe("in 10 days");
    expect(untilText(d(120), now)).toBe("in 4 months");
    expect(untilText(d(365 * 3), now)).toBe("in 3 years");
  });
});

describe("Future letters: pasting a FutureMe page", () => {
  const footer = "\n\nShare letter\nGenerate a unique URL where your friends and family can read your letter.\n\nPrivacy\nThis letter is currently not visible to the public.\n\nHome\nSupport\n";

  it("cuts the share panel and footer, keeping the letter", () => {
    expect(stripFutureMeChrome(`Dear me,\n\nHello.\n\nThanks,\nMe${footer}`)).toBe("Dear me,\n\nHello.\n\nThanks,\nMe");
  });

  it("leaves a letter without the panel alone, even one that says 'share letter'", () => {
    const own = "Dear me,\nShare letter\nwith Rohan someday.";
    expect(stripFutureMeChrome(own)).toBe(own);
  });
});

describe("Future letters: the email", () => {
  it("keeps the words as written and escapes them in HTML", () => {
    const mail = renderLetter({ body: "Dear me,\n\nAre you <still> coding?", written_at: "2024-01-01T17:00:00Z" }, "America/New_York", "https://talos.app");
    expect(mail.subject).toBe("A letter from you, written Monday, January 1, 2024");
    expect(mail.text).toContain("Dear me,\n\nAre you <still> coding?");
    expect(mail.html).toContain("Are you &lt;still&gt; coding?");
    expect(mail.html).not.toContain("<still>");
    expect(mail.html).toContain("https://talos.app/tabs/letters");
  });
});
