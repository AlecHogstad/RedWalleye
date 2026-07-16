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

// The v1 kv app instantiates its OWN Supabase client (a different project) in
// the same browser tab. Two supabase-js clients in one page can trample each
// other's `Authorization` header, which made authenticated product writes go
// out as anonymous (RLS then rejected them). We defend against that by pinning
// the product session's access token onto every product data request via a
// wrapped fetch, so no sibling client can knock it off. Kept fresh by the auth
// listener below. `null` while signed out → requests fall back to the anon key.
let currentAccessToken: string | null = null;

const DATA_PATH = /\/(rest|functions|storage)\/v1\//;

function reqUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** Fetch that force-attaches the current product session token to data-plane
 *  requests (REST / Edge Functions / Storage). Auth endpoints are left alone so
 *  token refresh keeps using the anon apikey. */
function productFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (currentAccessToken && DATA_PATH.test(reqUrl(input))) {
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    headers.set("Authorization", `Bearer ${currentAccessToken}`);
    return fetch(input, { ...init, headers });
  }
  return fetch(input, init);
}

/** The product client, or null until env vars are set. A distinct auth
 *  storageKey keeps its session from clashing with the v1 kv client. */
export function getProductClient(): SupabaseClient | null {
  if (cached === undefined) {
    if (!productConfigured) {
      cached = null;
      return cached;
    }
    cached = createClient(url as string, anonKey as string, {
      auth: {
        storageKey: "tp-auth",
        persistSession: true,
        autoRefreshToken: true,
      },
      global: { fetch: productFetch },
    });
    // Track the live session token for productFetch. Seed from storage, then
    // follow every auth change (sign in/out, refresh).
    void cached.auth.getSession().then(({ data }) => {
      currentAccessToken = data.session?.access_token ?? null;
    });
    cached.auth.onAuthStateChange((_event, session) => {
      currentAccessToken = session?.access_token ?? null;
    });
  }
  return cached;
}
