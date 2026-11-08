// Inbox updates: application emails found in the owner's Gmail, proposed as changes to
// Applications. Shared by the scan (server) and the banner (client). No I/O here.

export const EMAIL_KINDS = ["confirmation", "oa_invite", "interview_invite", "rejection"] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];
export const isEmailKind = (v: unknown): v is EmailKind => EMAIL_KINDS.includes(v as EmailKind);

/** The Applications status each kind of email moves an application to. */
export const STATUS_FOR: Record<EmailKind, "Applied" | "OA Stage" | "Interview" | "Rejected"> = {
  confirmation: "Applied",
  oa_invite: "OA Stage",
  interview_invite: "Interview",
  rejection: "Rejected",
};

// ---- Finding the emails -------------------------------------------------------------------

// Wide on purpose: Claude decides what's actually about an application. Sent mail,
// chats, promotions and social updates are left out.
const TERMS = [
  'subject:(application OR applying OR applied OR candidacy OR interview OR assessment OR "next steps" OR "status update" OR "moving forward")',
  '"thank you for applying"', '"thanks for applying"', '"received your application"', '"your application"',
  '"online assessment"', "hackerrank", "codesignal", "hirevue", '"not to move forward"', '"other candidates"', '"schedule an interview"',
];

/** Gmail search for application emails that arrived after `since`. */
export const inboxQuery = (since: Date) =>
  `after:${Math.floor(since.getTime() / 1000)} -in:sent -in:chats -category:promotions -category:social (${TERMS.join(" OR ")})`;

// ---- Matching an email to an application -------------------------------------------------

const SUFFIXES = /\b(inc|llc|ltd|corp|corporation|co|company|the|plc|gmbh|limited)\b/g;

/** "Capital One, Inc." → "capital one". */
export const normCompany = (s: string) =>
  s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(SUFFIXES, " ").replace(/\s+/g, " ").trim();

export interface AppRow {
  id: string;
  company: string;
  position: string;
  status: string;
  applied_date: string;
}

/**
 * The application an email is about: same company (ignoring "Inc." and punctuation, or one
 * name containing the other, like "Capital One" and "Capital One Financial"); with several,
 * the one whose role matches, else the most recent.
 */
export function matchApplication(apps: AppRow[], company: string, role: string | null): AppRow | null {
  const c = normCompany(company);
  if (c.length < 2) return null;
  const same = apps.filter((a) => {
    const n = normCompany(a.company);
    return n === c || (Math.min(n.length, c.length) >= 4 && (n.includes(c) || c.includes(n)));
  });
  if (!same.length) return null;
  const r = role ? normCompany(role) : "";
  const byRole = r ? same.filter((a) => normCompany(a.position).includes(r) || r.includes(normCompany(a.position))) : [];
  const pool = byRole.length ? byRole : same;
  return [...pool].sort((a, b) => b.applied_date.localeCompare(a.applied_date))[0];
}

/**
 * What to propose, or null when there's nothing to change: a confirmation for an
 * application already tracked, or an email that would set the status it already has.
 */
export function proposal(kind: EmailKind, app: AppRow | null): { status: string; applicationId: string | null } | null {
  const status = STATUS_FOR[kind];
  if (!app) return { status, applicationId: null };
  if (kind === "confirmation") return null;
  if (app.status === status) return null;
  return { status, applicationId: app.id };
}

// ---- The banner --------------------------------------------------------------------------

export interface PendingUpdate {
  id: string;
  kind: EmailKind;
  company: string;
  role: string | null;
  email_date: string;
  subject: string | null;
  sender: string | null;
  application_id: string | null;
  proposed_status: string;
}

/** The banner's question for a pending update. */
export function bannerText(u: Pick<PendingUpdate, "kind" | "company" | "role">): string {
  const role = u.role?.trim();
  switch (u.kind) {
    case "confirmation":
      return role ? `Did you just apply to ${role} at ${u.company}?` : `Did you just apply to ${u.company}?`;
    case "oa_invite":
      return `Did you get an online assessment from ${u.company}?`;
    case "interview_invite":
      return `Did you get an interview invite from ${u.company}?`;
    case "rejection":
      return `Did you get a rejection from ${u.company}?`;
  }
}

/** What "Yes, update" will do, in a line under the question. */
export function bannerDetail(u: Pick<PendingUpdate, "kind" | "role" | "application_id" | "proposed_status">): string {
  const callback = u.kind === "oa_invite" ? " and logs an OA in Callbacks" : u.kind === "interview_invite" ? " and logs an interview in Callbacks" : "";
  return u.application_id
    ? `Yes sets it to ${u.proposed_status}${callback}.`
    : `It's not in Applications yet. Yes adds it${u.role ? ` (${u.role})` : ""} as ${u.proposed_status}${callback}.`;
}
