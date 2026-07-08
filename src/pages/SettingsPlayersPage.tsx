import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store/store";
import type { Player } from "../types";

export default function SettingsPlayersPage() {
  const { state, updatePlayer, addPlayer, removePlayer, rostersEditable } =
    useStore();

  const [name, setName] = useState("");
  const [handicap, setHandicap] = useState("");

  const teamMap = useMemo(
    () => Object.fromEntries(state.teams.map((t) => [t.id, t])),
    [state.teams],
  );

  const assigned = state.players.filter((p) => p.teamId);
  const pool = state.players.filter((p) => !p.teamId);

  const canAdd = name.trim().length > 0 && handicap.trim() !== "";
  const submitAdd = () => {
    if (!canAdd) return;
    addPlayer({ name: name.trim(), handicap: Number(handicap) || 0 });
    setName("");
    setHandicap("");
  };

  const row = (p: Player) => {
    const team = p.teamId ? teamMap[p.teamId] : undefined;
    const removable = rostersEditable && !p.teamId;
    return (
      <div className="field" key={p.id}>
        <span
          className="dot"
          style={{ background: team?.color ?? "var(--line)" }}
          title={team?.name ?? "No team"}
        />
        <input
          className="wide"
          value={p.name}
          onChange={(e) => updatePlayer(p.id, { name: e.target.value })}
        />
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>
          hcp
        </span>
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          value={p.handicap}
          onChange={(e) =>
            updatePlayer(p.id, {
              handicap: e.target.value === "" ? 0 : Number(e.target.value),
            })
          }
        />
        <button
          className="icon-btn danger"
          aria-label={`Remove ${p.name}`}
          disabled={!removable}
          title={
            p.teamId
              ? "Remove from their team first"
              : !rostersEditable
                ? "Locked while a round is live"
                : "Remove player"
          }
          onClick={() => removePlayer(p.id)}
        >
          ✕
        </button>
      </div>
    );
  };

  return (
    <>
      <div className="section" style={{ paddingBottom: 0 }}>
        <Link className="badge" to="/settings">
          ← Settings
        </Link>
        <h2 style={{ marginTop: 10 }}>Players</h2>
        <p className="hint" style={{ padding: "0 2px 8px" }}>
          Add, rename, and set handicaps for every golfer. Assign players to
          teams on the{" "}
          <Link className="linklike" to="/settings/teams">
            Teams
          </Link>{" "}
          page. A player must be off every team before they can be removed.
        </p>
      </div>

      <section className="section" style={{ paddingTop: 0 }}>
        <h2>Add a player</h2>
        <div className="card">
          <div className="field">
            <input
              className="wide"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <span className="spacer" />
            <span className="muted" style={{ fontSize: 12 }}>
              hcp
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder="0"
              value={handicap}
              onChange={(e) => setHandicap(e.target.value)}
            />
          </div>
          <div style={{ padding: 12 }}>
            <button className="btn" disabled={!canAdd} onClick={submitAdd}>
              Add player
            </button>
          </div>
        </div>
      </section>

      {pool.length > 0 && (
        <section className="section" style={{ paddingTop: 0 }}>
          <h2>Not on a team</h2>
          <div className="card">{pool.map(row)}</div>
        </section>
      )}

      <section className="section" style={{ paddingTop: 0 }}>
        <h2>On a team</h2>
        <div className="card">{assigned.map(row)}</div>
        <p className="hint">
          {assigned.length} assigned · {pool.length} in the pool ·{" "}
          {state.players.length} total
        </p>
      </section>
    </>
  );
}
