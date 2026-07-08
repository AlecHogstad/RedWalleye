import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store/store";
import {
  currentPickTeam,
  picksLeftFor,
  rosterFromDraft,
  type DraftTeam,
} from "../store/draft";
import type { Player } from "../types";

function hcp(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default function DraftPage() {
  const {
    state,
    rostersEditable,
    startDraft,
    draftPick,
    undoLastPick,
    resetDraft,
  } = useStore();

  const draft = state.draft;
  const teamMap = useMemo(
    () => Object.fromEntries(state.teams.map((t) => [t.id, t])),
    [state.teams],
  );
  const byName = useMemo(
    () => [...state.players].sort((a, b) => a.handicap - b.handicap),
    [state.players],
  );

  const setup = !draft || draft.status === "setup";
  // The draft can only run before play begins — re-drafting mid-trip would
  // scramble live scores. Name the round that's holding the lock.
  const lockedRound = state.rounds.find((r) => r.status !== "pending");

  return (
    <>
      <div className="section" style={{ paddingBottom: 0 }}>
        <Link className="badge" to="/settings">
          ← Settings
        </Link>
        <h2 style={{ marginTop: 10 }}>Team Draft</h2>
      </div>

      {!rostersEditable ? (
        <div className="section" style={{ paddingTop: 4 }}>
          <div
            className="card"
            style={{ padding: 14, borderLeft: "5px solid var(--accent)" }}
          >
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Draft locked</div>
            <p className="hint" style={{ padding: "0 0 8px" }}>
              {lockedRound
                ? `${lockedRound.name} has already been ${
                    lockedRound.status === "final" ? "finished" : "started"
                  }. `
                : "A round is already underway. "}
              The draft only runs before any round begins, so live scores can't
              get scrambled. To draft again, reset the app first.
            </p>
            <Link className="btn" to="/settings/reset">
              Reset app data
            </Link>
          </div>
        </div>
      ) : setup ? (
        <DraftSetup
          players={byName}
          initial={draft}
          disabled={!rostersEditable}
          onStart={startDraft}
        />
      ) : (
        <DraftBoard
          players={state.players}
          picks={draft.picks}
          captainA={draft.captainA!}
          captainB={draft.captainB!}
          firstPick={draft.firstPick!}
          status={draft.status === "done" ? "done" : "active"}
          teamMap={teamMap}
          disabled={!rostersEditable}
          onPick={draftPick}
          onUndo={undoLastPick}
          onReset={resetDraft}
        />
      )}
    </>
  );
}

// --- Setup: choose captains + who picks first -------------------------------

function DraftSetup({
  players,
  initial,
  disabled,
  onStart,
}: {
  players: Player[];
  initial: { captainA?: string; captainB?: string; firstPick?: DraftTeam } | undefined;
  disabled: boolean;
  onStart: (a: string, b: string, first: DraftTeam) => void;
}) {
  const [capA, setCapA] = useState(initial?.captainA ?? "");
  const [capB, setCapB] = useState(initial?.captainB ?? "");
  const [first, setFirst] = useState<DraftTeam>(initial?.firstPick ?? "tA");

  const ready = capA && capB && capA !== capB;

  const start = () => {
    if (!ready) return;
    if (
      window.confirm(
        "Start the draft? This clears the current rosters and matchups so the two captains can draft fresh.",
      )
    ) {
      onStart(capA, capB, first);
    }
  };

  const opt = (p: Player) => (
    <option key={p.id} value={p.id}>
      {p.name} ({hcp(p.handicap)})
    </option>
  );

  return (
    <>
      <div className="section" style={{ paddingTop: 4 }}>
        <p className="hint" style={{ padding: "0 2px 8px" }}>
          Pick the two captains and who drafts first. Everyone else goes into the
          pool; captains snake-draft seven each until both teams have eight.
        </p>
        <div className="card">
          <div className="field">
            <span className="dot" style={{ background: "#de4f2c" }} />
            <label style={{ width: 74 }}>Captain A</label>
            <select
              className="wide roster-select"
              value={capA}
              disabled={disabled}
              onChange={(e) => setCapA(e.target.value)}
            >
              <option value="">— choose —</option>
              {players.filter((p) => p.id !== capB).map(opt)}
            </select>
          </div>
          <div className="field">
            <span className="dot" style={{ background: "#2e6b3e" }} />
            <label style={{ width: 74 }}>Captain B</label>
            <select
              className="wide roster-select"
              value={capB}
              disabled={disabled}
              onChange={(e) => setCapB(e.target.value)}
            >
              <option value="">— choose —</option>
              {players.filter((p) => p.id !== capA).map(opt)}
            </select>
          </div>
        </div>
      </div>

      <div className="section" style={{ paddingTop: 0 }}>
        <h2>First pick</h2>
        <div className="card" style={{ display: "flex", gap: 8, padding: 12 }}>
          {(["tA", "tB"] as const).map((t) => (
            <button
              key={t}
              className={`choice ${first === t ? "picked" : ""}`}
              style={{ flex: 1 }}
              disabled={disabled}
              onClick={() => setFirst(t)}
            >
              <span className="choice-name">Team {t === "tA" ? "A" : "B"}</span>
            </button>
          ))}
        </div>
        <button className="btn start" disabled={disabled || !ready} onClick={start}>
          Start draft
        </button>
      </div>
    </>
  );
}

// --- Board: on the clock, pool, team columns --------------------------------

function DraftBoard({
  players,
  picks,
  captainA,
  captainB,
  firstPick,
  status,
  teamMap,
  disabled,
  onPick,
  onUndo,
  onReset,
}: {
  players: Player[];
  picks: string[];
  captainA: string;
  captainB: string;
  firstPick: DraftTeam;
  status: "active" | "done";
  teamMap: Record<string, { name: string; color: string }>;
  disabled: boolean;
  onPick: (id: string) => void;
  onUndo: () => void;
  onReset: () => void;
}) {
  const map = useMemo(
    () => Object.fromEntries(players.map((p) => [p.id, p])),
    [players],
  );
  const onClock = currentPickTeam(picks, firstPick);
  const pool = useMemo(
    () =>
      players
        .filter((p) => !p.teamId && !picks.includes(p.id))
        .sort((a, b) => a.handicap - b.handicap),
    [players, picks],
  );

  const rosterFor = (team: DraftTeam): string[] =>
    rosterFromDraft(team, picks, firstPick, captainA, captainB);

  const clockColor = onClock ? teamMap[onClock]?.color : undefined;

  const teamSection = (team: DraftTeam) => {
    const roster = rosterFor(team);
    const t = teamMap[team];
    const left = picksLeftFor(team, picks, firstPick);
    return (
      <section className="section" key={team} style={{ paddingTop: 0 }}>
        <h2>
          {t?.name}
          <span className="oval muted-oval">
            {roster.length}/8
          </span>
        </h2>
        <div className="card">
          {roster.map((id, i) => (
            <div className="field" key={id}>
              <span className="dot" style={{ background: t?.color }} />
              <span className="wide" style={{ fontWeight: 600 }}>
                {map[id]?.name ?? id}
                {i === 0 && (
                  <span className="oval" style={{ marginLeft: 8 }}>
                    Captain
                  </span>
                )}
              </span>
              <span className="muted">{map[id] ? hcp(map[id].handicap) : ""}</span>
            </div>
          ))}
        </div>
        {left > 0 && (
          <p className="hint" style={{ paddingTop: 6 }}>
            {left} pick{left === 1 ? "" : "s"} left
          </p>
        )}
      </section>
    );
  };

  return (
    <>
      {status === "active" ? (
        <div className="section" style={{ paddingTop: 4 }}>
          <div
            className="card draft-clock-card"
            style={{ "--draft-team-color": clockColor } as React.CSSProperties}
          >
            <div className="draft-clock-title">
              {teamMap[onClock ?? ""]?.name} on the clock
            </div>
            <div className="draft-clock-sub">
              Pick {picks.length + 1} of 14 · tap a golfer below to draft
            </div>
          </div>
        </div>
      ) : (
        <div className="section" style={{ paddingTop: 4 }}>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>✓ Draft complete</div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              Both teams are set — head to Rounds to build the matchups.
            </div>
            <Link className="btn start" to="/rounds" style={{ marginTop: 10 }}>
              Set matchups
            </Link>
          </div>
        </div>
      )}

      {/* Active: only the team on the clock. Done: both rosters. */}
      {status === "done" ? (
        <>
          {teamSection("tA")}
          {teamSection("tB")}
        </>
      ) : (
        onClock && teamSection(onClock)
      )}

      {/* Pool */}
      {pool.length > 0 && (
        <div className="section" style={{ paddingTop: 0 }}>
          <h2>Pool ({pool.length})</h2>
          <div className="card">
            {pool.map((p) => (
              <button
                key={p.id}
                className="choice"
                disabled={disabled || status !== "active" || !onClock}
                onClick={() => onPick(p.id)}
              >
                <span className="choice-name">{p.name}</span>
                <span className="choice-meta">{hcp(p.handicap)} hcp</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="section" style={{ paddingTop: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {picks.length > 0 && (
            <button className="btn ghost" disabled={disabled} onClick={onUndo}>
              Undo last pick
            </button>
          )}
          <p className="hint center" style={{ margin: 0, padding: 0 }}>
            <button className="linklike" disabled={disabled} onClick={onReset}>
              Start over
            </button>{" "}
            to re-pick captains or redo the draft.
          </p>
        </div>
      </div>
    </>
  );
}
