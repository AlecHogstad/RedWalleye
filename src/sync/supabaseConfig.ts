/**
 * Supabase project config — from Supabase dashboard → Project Settings → API.
 *
 * These are public identifiers (the anon key ships in every Supabase web
 * app); access is governed by row-level-security policies on the table,
 * not by keeping this secret.
 *
 * While this is null the app runs in local-only mode (scores stay on each
 * phone), exactly as before.
 */
export interface SupabaseConfig {
  url: string; // https://<project-ref>.supabase.co
  anonKey: string;
}

export const supabaseConfig: SupabaseConfig | null = null;
