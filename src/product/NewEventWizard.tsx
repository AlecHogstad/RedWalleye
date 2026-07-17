import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createEvent } from "./api";
import { Page, Card, colors, inputStyle, labelStyle, buttonStyle, ghostButtonStyle } from "./ui";

// Wizard step 1 — Basics. Writes the draft `events` row the moment this
// completes (create-then-refine, spec §9): a bail-out after this loses nothing
// and the share link is already live. Later steps (rounds, teams, roster) layer
// on from the event dashboard.

export default function NewEventWizard() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const event = await createEvent({ name });
      navigate(`/app/event/${event.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  };

  return (
    <Page>
      <button
        type="button"
        onClick={() => navigate("/app")}
        style={{ ...ghostButtonStyle, marginBottom: 20 }}
      >
        ← Cancel
      </button>

      <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>New event</h1>
      <p style={{ color: colors.muted, fontSize: 14, margin: "0 0 20px" }}>
        Start with the basics. You can add rounds, teams, and players next — and
        your share link works right away.
      </p>

      <Card>
        <form onSubmit={submit}>
          <label style={{ ...labelStyle, marginTop: 0 }} htmlFor="ev-name">
            Event name
          </label>
          <input
            id="ev-name"
            style={inputStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="5th Annual Hayward Invitational"
            required
            autoFocus
          />

          {error && (
            <p style={{ color: colors.danger, fontSize: 13, marginTop: 14 }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={busy || !name.trim()}
            style={{
              ...buttonStyle,
              width: "100%",
              marginTop: 20,
              opacity: busy || !name.trim() ? 0.6 : 1,
              cursor: busy || !name.trim() ? "default" : "pointer",
            }}
          >
            {busy ? "Creating…" : "Create event"}
          </button>
        </form>
      </Card>
    </Page>
  );
}
