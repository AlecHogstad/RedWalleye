import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FORMAT_LABELS, type Match, type Side } from "../types";
import {
  allocateStrokes,
  computeMatchState,
  strokesOnHole,
  teamScoreKey,
} from "../scoring/engine";
import { usePlayerMap, useStore } from "../store/store";

interface ScoreEntity {
  key: string; // playerId or team:<id>
  label: string;
  hint: string; // handicap info
  teamId: string;
}

function entitiesForSide(
  match: Match,
  side: Side,
  players: ReturnType<typeof usePlayerMap>,
): ScoreEntity[] {
  if (match.format === "scramble") {
    const names = side.playerIds.map((id) => players[id]?.name ?? "?").join(" + ");
    return [
      {
        key: teamScoreKey(side.teamId),
        label: names,
        hint: "team scramble score",
        teamId: side.teamId,
      },
    ];
  }
  return side.playerIds.map((id) => ({
    key: id,
    label: players[id]?.name ?? "?",
    hint: `${players[id]?.handicap ?? 0} hcp`,
    teamId: side.teamId,
  }));
}

export default function MatchPage() {
  const { matchId } = useParams();
  const { state, setScore } = useStore();
  const players = usePlayerMap();
  const match = state.matches.find((m) => m.id === matchId);
  const [hole, setHole] = useState(1);

  const st = useMemo(
    () => (match ? computeMatchState(match, state.players, state.course) : null),
    [match, state.players, state.course],
  );
  const alloc = useMemo(
    () => (match ? allocateStrokes(match, state.players) : null),
    [match, state.players],
  );

  if (!match || !st || !alloc) {
    return (
      <div className="section">
        <p>Match not found.</p>
        <Link className="btn" to="/">
          Back to tournament
        </Link>
      </div>
    );
  }

  const teamMap = Object.fromEntries(state.teams.map((t) => [t.id, t]));
  const holeInfo = state.course.holes.find((h) => h.number === hole)!;
  const entitiesA = entitiesForSide(match, match.sideA, players);
  const entitiesB = entitiesForSide(match, match.sideB, players);

  const strokesFor = (key: string) => {
    const total =
      match.format === "scramble"
        ? alloc.byTeam[key] ?? 0
        : alloc.byPlayer[key] ?? 0;
    return strokesOnHole(total, holeInfo.strokeIndex);
  };

  const bump = (key: string, delta: number) => {
    const current = match.scores[key]?.[hole];
    if (current == null) {
      setScore(match.id, key, hole, holeInfo.par); // first tap = par, then adjust
      return;
    }
    if (delta < 0 && current <= 1) {
      setScore(match.id, key, hole, null); // minus at 1 clears the entry
      return;
    }
    setScore(match.id, key, hole, Math.min(15, Math.max(1, current + delta)));
  };

  const leadClass = st.leader === "A" ? "leadA" : st.leader === "B" ? "leadB" : "";

  const renderRow = (e: ScoreEntity) => {
    const val = match.scores[e.key]?.[hole];
    const s = strokesFor(e.key);
    const team = teamMap[e.teamId];
    return (
      <div className="score-row" key={e.key}>
        <span className="dot" style={{ background: team?.color, alignSelf: "center" }} />
        <div className="who">
          <div className="n">{e.label}</div>
          <div className="h">
            {e.hint}
            {s > 0 && <span className="stroke-dot"> · {"•".repeat(s)} stroke{s > 1 ? "s" : ""}</span>}
          </div>
        </div>
        <span className="net-tag">
          {val != null ? `net ${val - s}` : ""}
        </span>
        <div className="stepper">
          <button onClick={() => bump(e.key, -1)} aria-label="minus">
            −
          </button>
          <span className={`val ${val == null ? "empty" : ""}`}>{val ?? "–"}</span>
          <button onClick={() => bump(e.key, +1)} aria-label="plus">
            +
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="section" style={{ paddingBottom: 0 }}>
        <Link className="badge" to="/">
          ← Tournament
        </Link>
        <h2 style={{ marginTop: 10 }}>{FORMAT_LABELS[match.format]}</h2>
      </div>

      {/* Running status banner */}
      <div className="section" style={{ paddingTop: 4 }}>
        <div className="card" style={{ padding: "12px 16px", textAlign: "center" }}>
          <div className={`result ${leadClass}`} style={{ fontSize: 22, fontWeight: 800 }}>
            {st.thru === 0
              ? "Ready to start"
              : st.complete
                ? `${leaderName(st.leader, match, teamMap)} win ${st.resultText}`
                : st.leader === null
                  ? st.resultText
                  : `${leaderName(st.leader, match, teamMap)} ${st.resultText}`}
          </div>
          {!st.complete && st.thru > 0 && (
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {st.holesRemaining} to play
            </div>
          )}
        </div>
      </div>

      {/* Hole navigator */}
      <div className="holebar">
        <button
          className="navbtn"
          disabled={hole <= 1}
          onClick={() => setHole((h) => Math.max(1, h - 1))}
        >
          ‹
        </button>
        <div className="center">
          <div className="hole-num">Hole {hole}</div>
          <div className="meta">
            Par {holeInfo.par} · SI {holeInfo.strokeIndex}
          </div>
        </div>
        <button
          className="navbtn"
          disabled={hole >= state.course.holes.length}
          onClick={() => setHole((h) => Math.min(state.course.holes.length, h + 1))}
        >
          ›
        </button>
      </div>

      <div className="card" style={{ margin: "0 16px" }}>
        {entitiesA.map(renderRow)}
        <div style={{ height: 6, background: "var(--paper)" }} />
        {entitiesB.map(renderRow)}
      </div>

      {/* Hole jump grid with per-hole winners */}
      <div className="section">
        <h2>Holes</h2>
        <div className="card" style={{ paddingBottom: 12 }}>
          <div className="holegrid">
            {state.course.holes.map((h) => {
              const res = st.perHole.find((p) => p.hole === h.number);
              const win =
                res?.winner === "A"
                  ? teamMap[match.sideA.teamId]?.color
                  : res?.winner === "B"
                    ? teamMap[match.sideB.teamId]?.color
                    : res?.winner === "halve"
                      ? "var(--muted)"
                      : undefined;
              return (
                <button
                  key={h.number}
                  className={h.number === hole ? "active" : ""}
                  onClick={() => setHole(h.number)}
                >
                  {h.number}
                  {win && (
                    <span className="win" style={{ color: win }}>
                      ●
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <p className="hint">
          Tap <b>+</b> to start a hole at par, then adjust. Red dots mean that
          player (or the higher team, in a scramble) gets a handicap stroke here —
          it's already baked into the net score and the match result.
        </p>
      </div>
    </>
  );
}

function leaderName(
  leader: "A" | "B" | null,
  match: Match,
  teamMap: Record<string, { name: string }>,
): string {
  if (leader === "A") return teamMap[match.sideA.teamId]?.name ?? "A";
  if (leader === "B") return teamMap[match.sideB.teamId]?.name ?? "B";
  return "";
}
