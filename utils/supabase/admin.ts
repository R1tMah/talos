import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * The service-role client, for server jobs that run without the owner's session
 * (the Watch refresh). It bypasses RLS, so it's only ever created in route
 * handlers, and only used to write the watch_* tables. Null when the key isn't set.
 */
export const createAdminClient = () => {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return null;
  return createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};
