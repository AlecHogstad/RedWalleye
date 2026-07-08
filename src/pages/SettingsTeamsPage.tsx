import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store/store";
import { rosterOf } from "../store/roster";
import type { Team } from "../types";

function hcp(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Editable team name with an explicit Save so it's clear when the rename
 *  lands (rather than committing silently on every keystroke). */
function TeamNameField({
  team,
  onSave,
}: {
  team: Team;
  onSave: (name: string) => void;
}) {
  const [draft, setDraft] = useState(team.name);
  const [saved, setSaved] = useState(false);

  // Re-sync if the stored name changes (e.g. another phone renamed it).
  useEffect(() => {
    setDraft(team.name);
  }, [team.name]);

  const trimmed = draft.trim();
  const dirty = trimmed.length > 0 && trimmed !== team.name;

  const save = () => {
    if (!dirty) return;
    onSave(trimmed);
    setSaved(true);
  };

  return (
    <div className="field">
      <span className="dot" style={{ background: team.color }} />
      <input
        className="wide team-name-input"
        value={draft}
        aria-label={`${team.name} name`}
        onChange={(e) => {
          setDraft(e.target.value);
          setSaved(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
        }}
      />
      <button className="save-btn" disabled={!dirty} onClick={save}>
        {saved && !dirty ? "Saved" : "Save"}
      </button>
    </div>
  );
}

export default function SettingsTeamsPage() {
  const { state, updateTeam } = useStore();

  const playerMap = useMemo(
    () => Object.fromEntries(state.players.map((p) => [p.id, p])),
    [state.players],
  );

  return (
    <>
      <div className="section" style={{ paddingBottom: 0 }}>
        <Link className="badge" to="/settings">
          ← Settings
        </Link>
        <h2 style={{ marginTop: 10 }}>Teams</h2>
        <p className="hint" style={{ padding: "0 2px 8px" }}>
          Rename the two teams here. Rosters are set by the captains in the
          Draft — this list shows who's been drafted so far.
        </p>
      </div>

      {state.teams.map((team) => {
        const roster = rosterOf(state, team.id);
        const captain = team.captainId ? playerMap[team.captainId] : undefined;
        const total = roster.reduce(
          (s, id) => s + (playerMap[id]?.handicap ?? 0),
          0,
        );

        return (
          <section className="section" key={team.id} style={{ paddingTop: 0 }}>
            <div className="card">
              <TeamNameField
                team={team}
                onSave={(name) => updateTeam(team.id, { name })}
              />
              {roster.length === 0 ? (
                <p className="hint" style={{ padding: "6px 2px" }}>
                  No players drafted yet.
                </p>
              ) : (
                roster.map((id) => {
                  const p = playerMap[id];
                  if (!p) return null;
                  return (
                    <div className="field" key={id}>
                      <span className="dot" style={{ background: team.color }} />
                      <span className="wide" style={{ fontWeight: 600 }}>
                        {p.name}
                        {team.captainId === id && (
                          <span className="oval" style={{ marginLeft: 8 }}>
                            Captain
                          </span>
                        )}
                      </span>
                      <span className="muted">{hcp(p.handicap)}</span>
                    </div>
                  );
                })
              )}
            </div>
            <p className="hint" style={{ paddingTop: 6 }}>
              {roster.length} player{roster.length === 1 ? "" : "s"}
              {captain ? ` · captain ${captain.name}` : ""} · Σ handicap {hcp(total)}
            </p>
          </section>
        );
      })}
    </>
  );
}
