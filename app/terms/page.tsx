import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of service · TALOS" };

const CONTACT = "rimahapatra7@gmail.com";

/** Public (no login), so Google's OAuth consent screen can link to it. */
export default function TermsPage() {
  return (
    <main className="screen legal">
      <h1>Terms of service</h1>
      <p className="faint">Last updated October 23, 2026</p>
      <p>
        TALOS is a personal app made for and used by its owner only. It isn&rsquo;t offered to the public, and there
        is no way to sign up.
      </p>
      <p>
        It is provided as is, without warranties of any kind. Information shown from outside sources (calendar
        events, weather, scores, transit times, news) is copied from those sources and may be late or wrong; check the
        original when it matters.
      </p>
      <p>
        How data is handled is described in the <a href="/privacy">privacy policy</a>. Questions:{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </main>
  );
}
