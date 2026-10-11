"use client";

import { useState } from "react";
import { ScreenHeader } from "@/components/ui";
import { createClient } from "@/utils/supabase/client";

/** Signed once on the phone; the session cookie persists after that. */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError("Failed");
      setBusy(false);
      return;
    }
    // Only same-site paths, so the redirect can't be pointed elsewhere.
    const next = new URLSearchParams(location.search).get("next");
    location.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
  };

  return (
    <main className="screen">
      <ScreenHeader title="Sign in" />
      <form className="card" onSubmit={submit}>
        <div className="form">
          <label className="field full">
            <span className="field-label">
              <span className="label">Email</span>
            </span>
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field full">
            <span className="field-label">
              <span className="label">Password</span>
            </span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        </div>
        {error && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--t-sm)", margin: "var(--s-3) 0 0" }}>
            {error}
          </p>
        )}
        <div className="sheet-actions">
          <button type="submit" className="btn btn-primary" disabled={busy || !email || !password}>
            Sign in
          </button>
        </div>
      </form>
    </main>
  );
}
