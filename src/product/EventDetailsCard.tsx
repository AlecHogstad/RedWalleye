import { useState, type FormEvent } from "react";
import { updateEvent } from "./api";
import type { EventRow } from "./types";
import { Card, colors, inputStyle, labelStyle, buttonStyle, ghostButtonStyle } from "./ui";

// Event details — name + planned player count. Editable while the event is a
// draft (same "until the first round starts" gate as everything else on the
// dashboard); read-only after.

export default function EventDetailsCard({
  event,
  editable,
  onSaved,
}: {
  event: EventRow;
  editable: boolean;
  onSaved: (ev: EventRow) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(event.name);
  const [players, setPlayers] = useState(String(event.expected_players ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playersNum = Number(players);
  const valid =
    name.trim().length > 0 &&
    (players === "" || (Number.isInteger(playersNum) && playersNum >= 2 && playersNum <= 64));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateEvent(event.id, {
        name,
        expectedPlayers: players === "" ? null : playersNum,
      });
      onSaved(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Details</div>
        {editable && !editing && (
          <button
            type="button"
            style={{ ...ghostButtonStyle, fontSize: 13 }}
            onClick={() => {
              setName(event.name);
              setPlayers(String(event.expected_players ?? ""));
              setEditing(true);
            }}
          >
            Edit
          </button>
        )}
      </div>

      {!editing && (
        <p style={{ color: colors.muted, fontSize: 14, margin: "10px 0 0" }}>
          {event.expected_players != null
            ? `${event.expected_players} players`
            : "Player count not set"}
        </p>
      )}

      {editing && (
        <form onSubmit={save}>
          <label style={labelStyle} htmlFor="det-name">Event name</label>
          <input
            id="det-name"
            style={inputStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <label style={labelStyle} htmlFor="det-players">Players</label>
          <input
            id="det-players"
            type="number"
            min={2}
            max={64}
            style={inputStyle}
            value={players}
            onChange={(e) => setPlayers(e.target.value)}
          />
          {error && <p style={{ color: colors.danger, fontSize: 13, marginTop: 12 }}>{error}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button
              type="submit"
              disabled={busy || !valid}
              style={{ ...buttonStyle, flex: 1, opacity: busy || !valid ? 0.6 : 1 }}
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              style={ghostButtonStyle}
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}
