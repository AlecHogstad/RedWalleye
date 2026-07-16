import { useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";

// Minimal organizer auth screen — the first product-surface page. Neutral,
// utilitarian styling (the product register, not the golf-club theme). This is
// the seed the O-100 wizard will sit behind.

function Shell({ children }: { children: ReactNode }) {
  const wrap: CSSProperties = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0b0d0f",
    color: "#e8eaed",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    padding: 24,
  };
  const card: CSSProperties = {
    width: "100%",
    maxWidth: 380,
    background: "#15181c",
    border: "1px solid #24282e",
    borderRadius: 12,
    padding: 28,
  };
  return (
    <div style={wrap}>
      <div style={card}>{children}</div>
    </div>
  );
}

const label: CSSProperties = { display: "block", fontSize: 13, color: "#9aa0a6", margin: "14px 0 6px" };
const input: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #2b3038",
  background: "#0f1215",
  color: "#e8eaed",
  fontSize: 15,
  boxSizing: "border-box",
};
const button: CSSProperties = {
  width: "100%",
  marginTop: 18,
  padding: "11px 12px",
  borderRadius: 8,
  border: "none",
  background: "#3b82f6",
  color: "#fff",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
};

export default function LoginPage() {
  const { configured, loading, user, signUp, signIn } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!configured) {
    return (
      <Shell>
        <h1 style={{ fontSize: 20, margin: 0 }}>Connect Supabase</h1>
        <p style={{ color: "#9aa0a6", fontSize: 14, lineHeight: 1.6 }}>
          Copy <code>.env.example</code> to <code>.env.local</code>, fill in your
          project's <code>VITE_SUPABASE_URL</code> and{" "}
          <code>VITE_SUPABASE_ANON_KEY</code>, then restart <code>npm run dev</code>.
        </p>
      </Shell>
    );
  }
  if (loading) {
    return (
      <Shell>
        <p style={{ color: "#9aa0a6" }}>Loading…</p>
      </Shell>
    );
  }
  // Signed in already → into the product. The home screen owns sign-out.
  if (user) return <Navigate to="/app" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const res =
      mode === "up" ? await signUp(email, password, name || undefined) : await signIn(email, password);
    setBusy(false);
    if (res.error) setError(res.error);
    else if (mode === "up")
      setNotice("Account created. If email confirmation is on, check your inbox; otherwise you're in.");
  };

  return (
    <Shell>
      <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>
        {mode === "in" ? "Sign in" : "Create your account"}
      </h1>
      <p style={{ color: "#9aa0a6", fontSize: 13, margin: 0 }}>Organizer access</p>

      <form onSubmit={submit}>
        {mode === "up" && (
          <>
            <label style={label} htmlFor="name">Name</label>
            <input id="name" style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Alec" />
          </>
        )}
        <label style={label} htmlFor="email">Email</label>
        <input id="email" style={input} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <label style={label} htmlFor="password">Password</label>
        <input id="password" style={input} type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />

        {error && <p style={{ color: "#f87171", fontSize: 13, marginTop: 12 }}>{error}</p>}
        {notice && <p style={{ color: "#34d399", fontSize: 13, marginTop: 12 }}>{notice}</p>}

        <button style={{ ...button, opacity: busy ? 0.6 : 1 }} disabled={busy} type="submit">
          {busy ? "…" : mode === "in" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        onClick={() => {
          setMode(mode === "in" ? "up" : "in");
          setError(null);
          setNotice(null);
        }}
        style={{ marginTop: 16, background: "none", border: "none", color: "#9aa0a6", fontSize: 13, cursor: "pointer", padding: 0 }}
      >
        {mode === "in" ? "Need an account? Create one" : "Have an account? Sign in"}
      </button>
    </Shell>
  );
}
