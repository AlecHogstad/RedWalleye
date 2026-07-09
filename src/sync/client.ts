import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfig } from "./supabaseConfig";

// One shared Supabase client for the whole app. A second `createClient` in the
// same browser context spins up a second GoTrueClient under the same auth
// storage key, which Supabase warns "may produce undefined behavior when used
// concurrently" — so both the realtime/kv layer (sync.ts) and media storage
// (media.ts) go through this single instance. Created lazily so importing the
// pure merge helpers in unit tests never touches the network stack.
let _client: SupabaseClient | null | undefined;

export function getSupabaseClient(): SupabaseClient | null {
  if (_client === undefined) {
    _client = supabaseConfig
      ? createClient(supabaseConfig.url, supabaseConfig.anonKey)
      : null;
  }
  return _client;
}
