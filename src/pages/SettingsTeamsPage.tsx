import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store/store";
import { rosterOf } from "../store/roster";
import type { Player, Team } from "../types";

const MAX_SLOTS = 4;

function hcp(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function optionLabel(p: Player): string {
  return `${p.name} (${hcp(p.handicap)})`;
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
  const { state, updateTeam, setTeamRoster, rostersEditable } = useStore();

  const playerMap = useMemo(
    () => Object.fromEntries(state.players.map((p) => [p.id, p])),
    [state.players],
  );

  // Players not currently on any team — available to drop into a slot.
  const unassigned = useMemo(
    () =>
      state.players
        .filter((p) => !p.teamId)
        .sort((a, b) => a.name.localeCompare(b.name)),
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
          Rename teams and set each roster (up to {MAX_SLOTS} players). Pick from
          players who aren't on a team yet — add new golfers on the{" "}
          <Link className="linklike" to="/settings/players">
            Players
          </Link>{" "}
          page.
        </p>
        {!rostersEditable && (
          <p className="hint" style={{ padding: "0 2px 8px", color: "var(--accent)" }}>
            Rosters lock once a round has started. Finish or reopen rounds to edit
            who's on a team. (Names can still be changed.)
          </p>
        )}
      </div>

      {state.teams.map((team) => {
        const roster = rosterOf(state, team.id);
        const slots: string[] = [...roster];
        while (slots.length < MAX_SLOTS) slots.push("");
        const total = roster.reduce(
          (s, id) => s + (playerMap[id]?.handicap ?? 0),
          0,
        );

        const setSlot = (index: number, value: string) => {
          const nextSlots = [...roster];
          while (nextSlots.length < MAX_SLOTS) nextSlots.push("");
          nextSlots[index] = value;
          setTeamRoster(team.id, nextSlots.filter(Boolean));
        };

        return (
          <section className="section" key={team.id} style={{ paddingTop: 0 }}>
            <div className="card">
              <TeamNameField
                team={team}
                onSave={(name) => updateTeam(team.id, { name })}
              />
              {slots.map((slotId, i) => {
                const current = slotId ? playerMap[slotId] : undefined;
                return (
                  <div className="field" key={i}>
                    <span className="muted" style={{ width: 22, fontSize: 12 }}>
                      {i + 1}
                    </span>
                    <select
                      className="wide roster-select"
                      value={slotId}
                      disabled={!rostersEditable}
                      onChange={(e) => setSlot(i, e.target.value)}
                    >
                      <option value="">— empty —</option>
                      {current && (
                        <option value={current.id}>{optionLabel(current)}</option>
                      )}
                      {unassigned.map((p) => (
                        <option key={p.id} value={p.id}>
                          {optionLabel(p)}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            <p className="hint" style={{ paddingTop: 6 }}>
              Σ handicap {hcp(total)}
            </p>
          </section>
        );
      })}
    </>
  );
}
