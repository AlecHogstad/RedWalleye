import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createEvent } from "./api";
import { Page, Card, colors, displayStyle, inputStyle, labelStyle, buttonStyle, ghostButtonStyle } from "./ui";

// Wizard step 1 — Basics: name + how many players + how many rounds. Writes
// the draft `events` row plus N placeholder rounds the moment this completes
// (create-then-refine, spec §9); course & format per round are set on the
// dashboard. All of it stays editable until the first round starts.

export default function NewEventWizard() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [players, setPlayers] = useState("16");
  const [rounds, setRounds] = useState("3");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playersNum = Number(players);
  const roundsNum = Number(rounds);
  const valid =
    name.trim().length > 0 &&
    Number.isInteger(playersNum) &&
    playersNum >= 2 &&
    playersNum <= 64 &&
    Number.isInteger(roundsNum) &&
    roundsNum >= 1 &&
    roundsNum <= 10;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const event = await createEvent({
        name,
        expectedPlayers: playersNum,
        rounds: roundsNum,
      });
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

      <h1 style={{ ...displayStyle, fontSize: 24, margin: "0 0 4px" }}>New event</h1>
      <p style={{ color: colors.muted, fontSize: 14, margin: "0 0 20px" }}>
        The basics — all of this stays editable until your first round starts, and
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

          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle} htmlFor="ev-players">
                Players
              </label>
              <input
                id="ev-players"
                type="number"
                min={2}
                max={64}
                style={inputStyle}
                value={players}
                onChange={(e) => setPlayers(e.target.value)}
                required
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle} htmlFor="ev-rounds">
                Rounds
              </label>
              <input
                id="ev-rounds"
                type="number"
                min={1}
                max={10}
                style={inputStyle}
                value={rounds}
                onChange={(e) => setRounds(e.target.value)}
                required
              />
            </div>
          </div>
          <p style={{ color: colors.muted, fontSize: 12, margin: "8px 0 0", lineHeight: 1.5 }}>
            Each round's course and game format are set on the next screen.
          </p>

          {error && (
            <p style={{ color: colors.danger, fontSize: 13, marginTop: 14 }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={busy || !valid}
            style={{
              ...buttonStyle,
              width: "100%",
              marginTop: 20,
              opacity: busy || !valid ? 0.6 : 1,
              cursor: busy || !valid ? "default" : "pointer",
            }}
          >
            {busy ? "Creating…" : "Create event"}
          </button>
        </form>
      </Card>
    </Page>
  );
}
