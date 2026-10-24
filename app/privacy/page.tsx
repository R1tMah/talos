import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy policy · TALOS" };

const UPDATED = "October 23, 2026";
const CONTACT = "rimahapatra7@gmail.com";

/** Public (no login), so Google's OAuth consent screen can link to it. */
export default function PrivacyPage() {
  return (
    <main className="screen legal">
      <h1>Privacy policy</h1>
      <p className="faint">Last updated {UPDATED}</p>

      <p>
        TALOS is a personal tracking app built and used by one person, its owner. It has no other users and no
        sign-ups. This policy covers the data it handles, including data from Google.
      </p>

      <h2>Google user data</h2>
      <p>When the owner connects Google Calendar, TALOS asks Google for read-only access to their calendars:</p>
      <ul>
        <li>
          <b>What it reads:</b> the list of the owner&rsquo;s calendars (names and colors) and events on the
          calendars the owner chooses (title, start and end time, location and the event&rsquo;s link) from today
          through the next 7 days. It also receives the email address of the Google account, to show which account
          is connected.
        </li>
        <li>
          <b>How it&rsquo;s used:</b> only to show those events to the owner on the Watch tab of this app. Events
          are shown as Google gives them; nothing is rewritten, summarized or analyzed.
        </li>
        <li>
          <b>Where it&rsquo;s stored:</b> the latest week of events and Google&rsquo;s refresh token are stored in
          the app&rsquo;s private database (Supabase). The refresh token can only be read by the app&rsquo;s server,
          never by the browser. Events are replaced on each refresh (about every 15 minutes).
        </li>
        <li>
          <b>Sharing:</b> Google data is not sold, shared with or transferred to anyone, not used for advertising,
          and not used to train AI or machine-learning models.
        </li>
        <li>
          <b>Removing access:</b> &ldquo;Disconnect&rdquo; in the calendar&rsquo;s settings revokes the token at
          Google and deletes it from the database. Access can also be removed at{" "}
          <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.
        </li>
      </ul>
      <p>
        TALOS&rsquo;s use of information received from Google APIs adheres to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>,
        including the Limited Use requirements.
      </p>

      <h2>Other data</h2>
      <p>
        Everything else in TALOS (weight, food, notes, journals, applications and similar entries) is typed in by the
        owner and stored in the same private database. Chat messages are sent to Anthropic&rsquo;s API to work out
        where an entry belongs; Google data is not sent there.
      </p>

      <h2>Contact</h2>
      <p>
        Questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </main>
  );
}
