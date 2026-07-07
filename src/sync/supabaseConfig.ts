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

export const supabaseConfig: SupabaseConfig | null = {
  url: "https://dbhckqolbxdbpxjnwcpv.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRiaGNrcW9sYnhkYnB4am53Y3B2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0NDcwMDIsImV4cCI6MjA5OTAyMzAwMn0.T9LWb5Wh7kb5k8C0agz1EQ2yk4l_sasTls5YBlO45D8",
};
