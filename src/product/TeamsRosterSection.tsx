import { useEffect, useState, type FormEvent } from "react";
import {
  listTeams,
  createDefaultTeams,
  renameTeam,
  listEventPlayers,
  addEventPlayer,
  updateEventPlayer,
  removeEventPlayer,
} from "./api";
import type { EventPlayer, EventRow, Team } from "./types";
import { Card, colors, inputStyle, labelStyle, buttonStyle, ghostButtonStyle } from "./ui";

// Wizard step 3 — Teams & roster on the event dashboard. Two captain teams
// (the engine is 2-team head-to-head; individual/N-team modes arrive with the
// stroke-play format), renameable while the event is a draft. The roster is
// optional pre-entry: most players arrive via the share link and claim these
// slots (O-92) — but the organizer can type names/handicaps now, assign teams,
// and remove anyone.

export default function TeamsRosterSection({
  event,
  editable,
}: {
  event: EventRow;
  editable: boolean;
}) {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [players, setPlayers] = useState<EventPlayer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Team rename
  const [editingTeam, setEditingTeam] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");

  // Add player form
  const [newName, setNewName] = useState("");
  const [newHcp, setNewHcp] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([listTeams(event.id), listEventPlayers(event.id)])
      .then(async ([t, p]) => {
        if (!active) return;
        // First visit on a fresh event: seed Team A / Team B.
        if (t.length === 0 && editable) {
          try {
            t = await createDefaultTeams(event.id);
          } catch {
            /* non-fatal — renders team-less; next load retries */
          }
        }
        if (!active) return;
        setTeams(t);
        setPlayers(p);
      })
      .catch((err) => active && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      active = false;
    };
  }, [event.id, editable]);

  const saveTeamName = async (teamId: string) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await renameTeam(teamId, teamName);
      setTeams((prev) => (prev ?? []).map((t) => (t.id === teamId ? updated : t)));
      setEditingTeam(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const addPlayer = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const hcp = newHcp.trim() === "" ? null : Number(newHcp);
      if (hcp !== null && (!Number.isFinite(hcp) || hcp < -10 || hcp > 54)) {
        throw new Error("Handicap must be a number between -10 and 54.");
      }
      const created = await addEventPlayer(event.id, newName, hcp);
      setPlayers((prev) => [...(prev ?? []), created]);
      setNewName("");
      setNewHcp("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const assign = async (playerId: string, teamId: string | null) => {
    setError(null);
    try {
      const updated = await updateEventPlayer(playerId, { teamId });
      setPlayers((prev) => (prev ?? []).map((p) => (p.id === playerId ? updated : p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const remove = async (playerId: string) => {
    setError(null);
    const prev = players;
    setPlayers((p) => (p ?? []).filter((x) => x.id !== playerId));
    try {
      await removeEventPlayer(playerId);
    } catch (err) {
      setPlayers(prev); // delete didn't take — restore
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const active = (players ?? []).filter((p) => p.status === "active");
  const countLabel =
    event.expected_players != null
      ? `${active.length} of ${event.expected_players}`
      : `${active.length}`;

  return (
    <>
      <Card>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Teams</div>
        {teams === null && !error && (
          <p style={{ color: colors.muted, fontSize: 14, margin: "10px 0 0" }}>Loading…</p>
        )}
        {teams?.map((team) => (
          <div
            key={team.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 0 0",
            }}
          >
            {editingTeam === team.id ? (
              <form
                style={{ display: "flex", gap: 8, flex: 1 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveTeamName(team.id);
                }}
              >
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  autoFocus
                  required
                />
                <button type="submit" disabled={busy} style={{ ...buttonStyle, padding: "8px 14px" }}>
                  Save
                </button>
                <button type="button" style={ghostButtonStyle} onClick={() => setEditingTeam(null)}>
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <div style={{ fontSize: 14 }}>
                  {team.name}{" "}
                  <span style={{ color: colors.muted, fontSize: 13 }}>
                    · {active.filter((p) => p.team_id === team.id).length} players
                  </span>
                </div>
                {editable && (
                  <button
                    type="button"
                    style={{ ...ghostButtonStyle, fontSize: 12 }}
                    onClick={() => {
                      setEditingTeam(team.id);
                      setTeamName(team.name);
                    }}
                  >
                    Rename
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </Card>

      <Card>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Roster</div>
          <span style={{ color: colors.muted, fontSize: 13 }}>{countLabel} players</span>
        </div>
        <p style={{ color: colors.muted, fontSize: 13, lineHeight: 1.5, margin: "8px 0 0" }}>
          Add names now or just share the link — players can add themselves and claim a
          pre-entered name.
        </p>

        {players !== null &&
          active.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 0",
                borderBottom: `1px solid ${colors.border}`,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.name}
                </div>
                <div style={{ color: colors.muted, fontSize: 12, marginTop: 1 }}>
                  {p.handicap != null ? `HCP ${p.handicap}` : "No handicap"}
                  {p.claimed_by ? " · joined" : ""}
                </div>
              </div>
              <select
                aria-label={`Team for ${p.name}`}
                style={{ ...inputStyle, width: 130, padding: "8px 10px", fontSize: 13 }}
                value={p.team_id ?? ""}
                disabled={!editable}
                onChange={(e) => void assign(p.id, e.target.value || null)}
              >
                <option value="">No team</option>
                {(teams ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {editable && (
                <button
                  type="button"
                  onClick={() => void remove(p.id)}
                  style={{ ...ghostButtonStyle, fontSize: 12, color: colors.danger }}
                >
                  Remove
                </button>
              )}
            </div>
          ))}

        {editable && (
          <form onSubmit={addPlayer}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle} htmlFor="pl-name">Name</label>
                <input
                  id="pl-name"
                  style={inputStyle}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Mike"
                />
              </div>
              <div style={{ width: 90 }}>
                <label style={labelStyle} htmlFor="pl-hcp">HCP</label>
                <input
                  id="pl-hcp"
                  style={inputStyle}
                  value={newHcp}
                  onChange={(e) => setNewHcp(e.target.value)}
                  placeholder="12.4"
                  inputMode="decimal"
                />
              </div>
              <button
                type="submit"
                disabled={busy || !newName.trim()}
                style={{ ...buttonStyle, opacity: busy || !newName.trim() ? 0.6 : 1 }}
              >
                Add
              </button>
            </div>
          </form>
        )}

        {error && <p style={{ color: colors.danger, fontSize: 13, marginTop: 12 }}>{error}</p>}
      </Card>
    </>
  );
}
