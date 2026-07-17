import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The PRODUCT Supabase client — a different project from the v1 kv sync
// (src/sync/client.ts). Configured from env so it's set per-environment and
// never hardcoded: copy .env.example to .env.local and fill in the new
// project's URL + anon key. Absent env vars leave it null, so the v1 app and
// the build never break when the product project isn't wired yet.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True once the product project's env vars are present. */
export const productConfigured = Boolean(url && anonKey);

let cached: SupabaseClient | null | undefined;

/** The product client, or null until env vars are set. A distinct auth
 *  storageKey keeps its session from clashing with the v1 kv client. */
export function getProductClient(): SupabaseClient | null {
  if (cached === undefined) {
    cached = productConfigured
      ? createClient(url as string, anonKey as string, {
          auth: {
            storageKey: "tp-auth",
            persistSession: true,
            autoRefreshToken: true,
          },
        })
      : null;
  }
  return cached;
}
