// Live checks against the running app and the Supabase project (#144, #146, #148).
// The app checks skip when the dev server isn't up (TALOS_URL, default :3001).

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../", import.meta.url).pathname;
const APP = process.env.TALOS_URL ?? "http://localhost:3001";

const env = Object.fromEntries(
  (existsSync(`${ROOT}.env.local`) ? readFileSync(`${ROOT}.env.local`, "utf8") : "")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, "")]),
);
const SUPABASE = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const appUp = await fetch(`${APP}/login`, { signal: AbortSignal.timeout(3000) }).then(() => true, () => false);

describe.skipIf(!appUp)("19. App endpoints without a session", () => {
  it("#144 /api/chat without a session returns 401", async () => {
    const res = await fetch(`${APP}/api/chat`, { method: "POST", body: JSON.stringify({ text: "168", clientMsgId: "x" }) });
    expect(res.status).toBe(401);
  });

  it("#144 /api/confirm without a session returns 401", async () => {
    const res = await fetch(`${APP}/api/confirm`, { method: "POST", body: JSON.stringify({ proposalId: "x" }) });
    expect(res.status).toBe(401);
  });

  it("pages without a session redirect to the login page", async () => {
    const res = await fetch(`${APP}/tabs/weight`, { redirect: "manual" });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("#148 the Anthropic key never appears in a response", async () => {
    const key = env.ANTHROPIC_API_KEY;
    if (!key) return;
    for (const path of ["/login", "/api/chat"]) {
      const body = await (await fetch(`${APP}${path}`, { method: path.startsWith("/api") ? "POST" : "GET" })).text();
      expect(body.includes(key), path).toBe(false);
    }
  });
});

describe.skipIf(!SUPABASE || !ANON)("19. Supabase without a session", () => {
  it("#146 a direct table read with only the public key is refused", async () => {
    for (const table of ["weights", "food_log", "callbacks", "weekly_weights"]) {
      const res = await fetch(`${SUPABASE}/rest/v1/${table}?select=*&limit=1`, { headers: { apikey: ANON } });
      const body = await res.json();
      expect(res.ok, table).toBe(false);
      expect(body.code, table).toBe("42501");
    }
  });

  it("#146 a write function called with only the public key is refused", async () => {
    const res = await fetch(`${SUPABASE}/rest/v1/rpc/save_weight`, {
      method: "POST",
      headers: { apikey: ANON, "content-type": "application/json" },
      body: JSON.stringify({ p_date: "2099-01-01", p_weight_lb: 170 }),
    });
    expect(res.ok).toBe(false);
  });
});

describe("19. Client bundle", () => {
  it("#148 no client code references the Anthropic key or SDK", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (f === "node_modules" || f.startsWith(".")) continue;
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(tsx?|mts)$/.test(f)) {
          const src = readFileSync(p, "utf8");
          if (/^["']use client["']/.test(src) && /ANTHROPIC_API_KEY|@anthropic-ai\/sdk/.test(src)) offenders.push(p);
          if (/NEXT_PUBLIC_ANTHROPIC/.test(src)) offenders.push(p);
        }
      }
    };
    for (const d of ["app", "components", "lib", "utils"]) walk(join(ROOT, d));
    expect(offenders).toEqual([]);
  });

  it("#148 the built client bundle doesn't contain the key", () => {
    const key = env.ANTHROPIC_API_KEY;
    const dir = join(ROOT, ".next/static");
    if (!key || !existsSync(dir)) return;
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (readFileSync(p, "utf8").includes(key)) hits.push(p);
      }
    };
    walk(dir);
    expect(hits).toEqual([]);
  });
});
