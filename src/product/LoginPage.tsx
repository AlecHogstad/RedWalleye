import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import {
  Page,
  Card,
  colors,
  displayStyle,
  serifItalicStyle,
  inputStyle,
  labelStyle,
  buttonStyle,
} from "./ui";

// Organizer auth screen — the front door of the product surface, in the
// Red Walleye club language (shared ui.tsx primitives).

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
      <Page center maxWidth={400}>
        <Card>
          <h1 style={{ ...displayStyle, fontSize: 20, margin: 0 }}>Connect Supabase</h1>
          <p style={{ color: colors.muted, fontSize: 14, lineHeight: 1.6 }}>
            Copy <code>.env.example</code> to <code>.env.local</code>, fill in your
            project's <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code>, then restart <code>npm run dev</code>.
          </p>
        </Card>
      </Page>
    );
  }
  if (loading) {
    return (
      <Page center maxWidth={400}>
        <p style={{ color: colors.muted, textAlign: "center" }}>Loading…</p>
      </Page>
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
    <Page center maxWidth={400}>
      <Card>
        <h1 style={{ ...displayStyle, fontSize: 22, margin: "0 0 4px" }}>
          {mode === "in" ? "Sign in" : "Create your account"}
        </h1>
        <p style={{ ...serifItalicStyle, color: colors.muted, fontSize: 13, margin: 0 }}>
          organizer access
        </p>

        <form onSubmit={submit}>
          {mode === "up" && (
            <>
              <label style={labelStyle} htmlFor="name">Name</label>
              <input id="name" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Alec" />
            </>
          )}
          <label style={labelStyle} htmlFor="email">Email</label>
          <input id="email" style={inputStyle} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          <label style={labelStyle} htmlFor="password">Password</label>
          <input id="password" style={inputStyle} type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />

          {error && <p style={{ color: colors.danger, fontSize: 13, marginTop: 12 }}>{error}</p>}
          {notice && <p style={{ color: colors.good, fontSize: 13, marginTop: 12 }}>{notice}</p>}

          <button
            style={{ ...buttonStyle, width: "100%", marginTop: 18, opacity: busy ? 0.6 : 1 }}
            disabled={busy}
            type="submit"
          >
            {busy ? "…" : mode === "in" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === "in" ? "up" : "in");
            setError(null);
            setNotice(null);
          }}
          style={{
            marginTop: 16,
            background: "none",
            border: "none",
            color: colors.muted,
            fontSize: 13,
            cursor: "pointer",
            padding: 0,
            textDecoration: "underline",
          }}
        >
          {mode === "in" ? "Need an account? Create one" : "Have an account? Sign in"}
        </button>
      </Card>
    </Page>
  );
}
