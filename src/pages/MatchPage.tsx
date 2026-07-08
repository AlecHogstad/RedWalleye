import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FORMAT_LABELS, FORMAT_RULES, type Match, type Side } from "../types";
import {
  allocateStrokes,
  computeMatchState,
  computeStrokePlay,
  strokesOnHole,
  teamScoreKey,
  type ScoringContext,
} from "../scoring/engine";
import { usePlayerMap, useRoundContexts, useStore } from "../store/store";
import { CheckFlag } from "../components/CheckFlag";

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
  const contexts = useRoundContexts();
  const match = state.matches.find((m) => m.id === matchId);
  const round = state.rounds.find((r) => r.id === match?.roundId);
  const ctx = match ? contexts[match.roundId] : undefined;

  // Open at the first hole with no scores yet, so re-entering a match
  // mid-round drops you where you left off (not back at hole 1). Runs once.
  const [hole, setHole] = useState(() =>
    match && ctx ? firstUnscoredHole(match, ctx) : 1,
  );

  // Keep the screen awake while scoring — no re-tapping between shots.
  useWakeLock();

  const strokePlay = match?.format === "fourman";

  const matchState = useMemo(
    () =>
      match && ctx && !strokePlay ? computeMatchState(match, state.players, ctx) : null,
    [match, state.players, ctx, strokePlay],
  );
  const teamState = useMemo(
    () =>
      match && ctx && strokePlay ? computeStrokePlay(match, state.players, ctx) : null,
    [match, state.players, ctx, strokePlay],
  );
  const alloc = useMemo(
    () => (match && ctx ? allocateStrokes(match, state.players, ctx) : null),
    [match, state.players, ctx],
  );

  if (!match || !round || !ctx || !alloc || (!matchState && !teamState)) {
    return (
      <div className="section">
        <p>Match not found.</p>
        <Link className="btn" to="/rounds">
          Back to rounds
        </Link>
      </div>
    );
  }

  if (round.status === "pending") {
    return (
      <div className="section">
        <div className="card" style={{ padding: 16 }}>
          <p style={{ marginTop: 0 }}>
            {round.name} hasn't started yet — the course and tees get picked when
            the round is started.
          </p>
          <Link className="btn" to="/rounds">
            Back to rounds
          </Link>
        </div>
      </div>
    );
  }

  const readOnly = round.status === "final";
  const teamMap = Object.fromEntries(state.teams.map((t) => [t.id, t]));
  const holeInfo = ctx.course.holes.find((h) => h.number === hole)!;
  const entitiesA = entitiesForSide(match, match.sideA, players);
  const entitiesB = strokePlay ? [] : entitiesForSide(match, match.sideB, players);
  const teamA = teamMap[match.sideA.teamId];

  const strokesFor = (key: string) => {
    const total =
      match.format === "scramble"
        ? alloc.byTeam[key] ?? 0
        : alloc.byPlayer[key] ?? 0;
    return strokesOnHole(total, holeInfo.strokeIndex);
  };

  const bump = (key: string, delta: number) => {
    if (readOnly) return;
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
          <button onClick={() => bump(e.key, -1)} disabled={readOnly} aria-label="minus">
            −
          </button>
          <span className={`val ${val == null ? "empty" : ""}`}>{val ?? "–"}</span>
          <button onClick={() => bump(e.key, +1)} disabled={readOnly} aria-label="plus">
            +
          </button>
        </div>
      </div>
    );
  };

  // Compact live score that sits between Prev / Next.
  const navScore = (() => {
    if (teamState) {
      if (teamState.thru === 0) {
        return { result: "—", sub: "not started", cls: "" };
      }
      return {
        result: teamState.toParText,
        sub: teamState.complete
          ? `net ${teamState.netTotal} · final`
          : `net ${teamState.netTotal} · thru ${teamState.thru}`,
        cls: "",
        flag: teamState.complete,
      };
    }
    if (matchState) {
      if (matchState.thru === 0) {
        return { result: "—", sub: "not started", cls: "" };
      }
      const cls =
        matchState.leader === "A" ? "leadA" : matchState.leader === "B" ? "leadB" : "";
      const who = leaderName(matchState.leader, match, teamMap);
      return {
        result: matchState.resultText.replace(/ thru.*/, ""),
        sub: matchState.complete
          ? `${who} win`
          : matchState.leader
            ? `${who} · thru ${matchState.thru}`
            : `thru ${matchState.thru}`,
        cls,
        flag: matchState.complete,
      };
    }
    return { result: "—", sub: "", cls: "" };
  })();

  const lastHole = ctx.course.holes.length;

  return (
    <>
      {/* Green hero: format, rules, course, hole grid, live score */}
      <section className="score-hero">
        <Link className="badge" to="/rounds">
          ← Rounds
        </Link>
        <h2 className="hero-title">
          {strokePlay ? `${teamA?.name} — Team Card` : FORMAT_LABELS[match.format]}
        </h2>
        <div className="rules rules-hero">{FORMAT_RULES[match.format]}</div>
        <p className="hero-course">
          {ctx.course.name}
          {ctx.tee ? ` - ${ctx.tee.name} Tees` : ""}
          {readOnly ? " · final (view only)" : ""}
        </p>
      </section>

      {/* Cream body: current hole, score rows, prev/score/next, ticker */}
      <div className="hole-head">
        <h2 className="hole-num">Hole {String(hole).padStart(2, "0")}</h2>
        <p className="hole-meta">
          Par {holeInfo.par}
          {holeInfo.yards ? ` - ${holeInfo.yards} yards` : ""} - HDCP{" "}
          {holeInfo.strokeIndex}
        </p>
      </div>

      <div className="card" style={{ margin: "0 16px" }}>
        {entitiesA.map(renderRow)}
        {entitiesB.length > 0 && (
          <>
            <div style={{ height: 6, background: "var(--cream)" }} />
            {entitiesB.map(renderRow)}
          </>
        )}
      </div>

      {/* Prev / live score / Next */}
      <div className="hole-nav">
        <button
          className="navbtn"
          disabled={hole <= 1}
          onClick={() => setHole((h) => Math.max(1, h - 1))}
        >
          Prev
        </button>
        <div className="nav-score">
          <div className={`result ${navScore.cls}`}>
            {navScore.flag && <CheckFlag size={13} />} {navScore.result}
          </div>
          {navScore.sub && <div className="sub">{navScore.sub}</div>}
        </div>
        <button
          className="navbtn next"
          disabled={hole >= lastHole}
          onClick={() => setHole((h) => Math.min(lastHole, h + 1))}
        >
          Next
        </button>
      </div>

      {/* Live activity ticker — placeholder for now */}
      <div className="ticker-wrap">
        <div className="ticker-label">Around the course</div>
        <div className="ticker" aria-label="Live activity from other groups">
          <div className="ticker-track">
            <span className="ticker-item ticker-placeholder">
              ⛳ Live activity from the other groups will show here — coming soon
            </span>
            <span className="ticker-item ticker-placeholder" aria-hidden="true">
              ⛳ Live activity from the other groups will show here — coming soon
            </span>
          </div>
        </div>
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

/** The first hole with no scores entered — where a re-opened match resumes.
 *  Falls back to the last hole when everything's been played. */
function firstUnscoredHole(match: Match, ctx: ScoringContext): number {
  for (const h of ctx.course.holes) {
    const anyScore = Object.values(match.scores).some(
      (byHole) => byHole?.[h.number] != null,
    );
    if (!anyScore) return h.number;
  }
  return ctx.course.holes.length;
}

/** Hold a Screen Wake Lock while the scorecard is open so phones don't
 *  sleep between shots. Re-acquires when the tab becomes visible again
 *  (the lock is dropped on tab-hide by the platform). No-ops where the
 *  API is unsupported. */
function useWakeLock(): void {
  useEffect(() => {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    if (!nav.wakeLock) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        if (document.visibilityState === "visible" && !cancelled) {
          lock = await nav.wakeLock!.request("screen");
        }
      } catch {
        /* denied (e.g. low battery) — nothing to do */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, []);
}
