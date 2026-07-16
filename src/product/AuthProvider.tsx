import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getProductClient, productConfigured } from "./supabase";

interface AuthValue {
  /** False until the product Supabase env vars are set. */
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signInWithMagicLink: (email: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = getProductClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!client) {
      setLoading(false);
      return;
    }
    let active = true;
    client.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setLoading(false);
      }
    });
    const { data: sub } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [client]);

  const value = useMemo<AuthValue>(
    () => ({
      configured: productConfigured,
      loading,
      session,
      user: session?.user ?? null,
      async signUp(email, password, displayName) {
        if (!client) return { error: "Supabase project not configured." };
        const { error } = await client.auth.signUp({
          email,
          password,
          options: displayName ? { data: { display_name: displayName } } : undefined,
        });
        return error ? { error: error.message } : {};
      },
      async signIn(email, password) {
        if (!client) return { error: "Supabase project not configured." };
        const { error } = await client.auth.signInWithPassword({ email, password });
        return error ? { error: error.message } : {};
      },
      async signInWithMagicLink(email) {
        if (!client) return { error: "Supabase project not configured." };
        const { error } = await client.auth.signInWithOtp({ email });
        return error ? { error: error.message } : {};
      },
      async signOut() {
        await client?.auth.signOut();
      },
    }),
    [client, loading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
