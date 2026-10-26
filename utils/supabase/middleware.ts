import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const PUBLIC_PAGES = new Set(["/privacy", "/terms"]);

export const updateSession = async (request: NextRequest) => {
  // Create an unmodified response
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    supabaseUrl!,
    supabaseKey!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    },
  );

  // Refreshes an expired session and writes the new cookies onto the response.
  // Without this call, the client above is created but the session never refreshes.
  const { data } = await supabase.auth.getClaims();

  // The scheduled Watch refresh has no session; the route checks its own secret.
  if (request.nextUrl.pathname === "/api/watch/refresh") return supabaseResponse;
  // Same for the Sunday email's tick.
  if (request.nextUrl.pathname === "/api/email/weekly") return supabaseResponse;
  // The daily Plaid sync job: no session; the route checks the cron secret.
  if (request.nextUrl.pathname === "/api/plaid/sync") return supabaseResponse;
  // Plaid's webhook has no session either; the route verifies Plaid's signature.
  if (request.nextUrl.pathname === "/api/plaid/webhook") return supabaseResponse;

  // Signed out: API calls get a plain 401; pages redirect to the login page.
  if (!data?.claims && request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // The privacy policy and terms are public: Google's consent screen links to them.
  if (PUBLIC_PAGES.has(request.nextUrl.pathname)) return supabaseResponse;
  if (!data?.claims && request.nextUrl.pathname !== "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }

  return supabaseResponse
};
