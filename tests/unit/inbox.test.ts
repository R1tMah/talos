import { describe, expect, it } from "vitest";
import { checkLabels } from "@/lib/agent/inbox";
import { bodyText, htmlText } from "@/lib/google/gmail";
import { bannerDetail, bannerText, inboxQuery, matchApplication, normCompany, proposal, type AppRow } from "@/lib/inbox";

const app = (over: Partial<AppRow>): AppRow => ({ id: "a1", company: "Ramp", position: "Software Engineer Intern", status: "Applied", applied_date: "2026-10-01", ...over });

describe("Inbox updates: matching an email to an application", () => {
  it("ignores case, punctuation and company suffixes", () => {
    expect(normCompany("Capital One, Inc.")).toBe("capital one");
    expect(normCompany("AT&T")).toBe("at and t");
    expect(matchApplication([app({ company: "Capital One" })], "Capital One, Inc.", null)?.company).toBe("Capital One");
  });

  it("matches a longer or shorter form of the name", () => {
    expect(matchApplication([app({ company: "Capital One" })], "Capital One Financial", null)).not.toBeNull();
    // Too short to trust containment: "IBM" in "IBMX" is not a match.
    expect(matchApplication([app({ company: "IBM" })], "IBMX Labs", null)).toBeNull();
  });

  it("with several applications, prefers the matching role, then the latest", () => {
    const apps = [
      app({ id: "old", position: "Data Analyst", applied_date: "2026-09-01" }),
      app({ id: "new", position: "Product Manager", applied_date: "2026-10-15" }),
      app({ id: "swe", position: "Software Engineer Intern", applied_date: "2026-08-01" }),
    ];
    expect(matchApplication(apps, "Ramp", "Software Engineer Intern")?.id).toBe("swe");
    expect(matchApplication(apps, "Ramp", null)?.id).toBe("new");
  });

  it("finds nothing for a company not tracked", () => {
    expect(matchApplication([app({})], "Stripe", null)).toBeNull();
  });
});

describe("Inbox updates: what to propose", () => {
  it("adds an untracked company with the status the email implies", () => {
    expect(proposal("confirmation", null)).toEqual({ status: "Applied", applicationId: null });
    expect(proposal("rejection", null)).toEqual({ status: "Rejected", applicationId: null });
  });

  it("moves a tracked application to the new status", () => {
    expect(proposal("oa_invite", app({}))).toEqual({ status: "OA Stage", applicationId: "a1" });
    expect(proposal("interview_invite", app({ status: "OA Stage" }))).toEqual({ status: "Interview", applicationId: "a1" });
    expect(proposal("rejection", app({ status: "Interview" }))).toEqual({ status: "Rejected", applicationId: "a1" });
  });

  it("asks nothing when nothing would change", () => {
    expect(proposal("confirmation", app({}))).toBeNull(); // already tracked
    expect(proposal("rejection", app({ status: "Rejected" }))).toBeNull();
  });
});

describe("Inbox updates: the banner", () => {
  it("asks in words that fit the email", () => {
    expect(bannerText({ kind: "confirmation", company: "Ramp", role: "SWE Intern" })).toBe("Did you just apply to SWE Intern at Ramp?");
    expect(bannerText({ kind: "confirmation", company: "Ramp", role: null })).toBe("Did you just apply to Ramp?");
    expect(bannerText({ kind: "rejection", company: "Ramp", role: null })).toBe("Did you get a rejection from Ramp?");
    expect(bannerText({ kind: "interview_invite", company: "Ramp", role: null })).toBe("Did you get an interview invite from Ramp?");
    expect(bannerText({ kind: "oa_invite", company: "Ramp", role: null })).toBe("Did you get an online assessment from Ramp?");
  });

  it("says what Yes will do", () => {
    expect(bannerDetail({ kind: "rejection", role: null, application_id: "a1", proposed_status: "Rejected" })).toBe("Yes sets it to Rejected.");
    expect(bannerDetail({ kind: "oa_invite", role: "SWE", application_id: null, proposed_status: "OA Stage" }))
      .toBe("It's not in Applications yet. Yes adds it (SWE) as OA Stage and logs an OA in Callbacks.");
  });
});

describe("Inbox updates: checking Claude's labels", () => {
  const mail = { subject: "Your application to Ramp", from: "Ramp Recruiting <no-reply@ramp.com>", text: "Thank you for applying to the Software Engineer Intern role." };

  it("keeps labels that the email backs up", () => {
    expect(checkLabels({ email_type: "confirmation", company_name: "Ramp", role: "Software Engineer Intern" }, mail))
      .toEqual({ kind: "confirmation", company: "Ramp", role: "Software Engineer Intern" });
  });

  it("drops a company name that isn't in the email", () => {
    expect(checkLabels({ email_type: "rejection", company_name: "Stripe", role: null }, mail).kind).toBe("irrelevant");
  });

  it("drops a role that isn't in the email but keeps the update", () => {
    expect(checkLabels({ email_type: "confirmation", company_name: "Ramp", role: "Staff Engineer" }, mail)).toEqual({ kind: "confirmation", company: "Ramp", role: null });
  });

  it("treats anything unexpected as irrelevant", () => {
    expect(checkLabels({ email_type: "offer", company_name: "Ramp", role: null }, mail).kind).toBe("irrelevant");
    expect(checkLabels({}, mail).kind).toBe("irrelevant");
  });
});

describe("Inbox updates: reading an email", () => {
  const b64 = (s: string) => Buffer.from(s).toString("base64url");

  it("prefers the plain-text part", () => {
    expect(bodyText({ mimeType: "multipart/alternative", parts: [
      { mimeType: "text/html", body: { data: b64("<p>HTML</p>") } },
      { mimeType: "text/plain", body: { data: b64("Plain text") } },
    ] })).toBe("Plain text");
  });

  it("falls back to the HTML part as text", () => {
    expect(bodyText({ mimeType: "text/html", body: { data: b64("<style>p{}</style><p>Hi &amp; thanks</p><p>Bye</p>") } })).toBe("Hi & thanks\nBye");
    expect(htmlText("a<br>b")).toBe("a\nb");
  });

  it("searches only mail after the given time, never sent mail", () => {
    const q = inboxQuery(new Date("2026-11-07T00:00:00Z"));
    expect(q.startsWith("after:1794009600 ")).toBe(true);
    expect(q).toContain("-in:sent");
  });
});
