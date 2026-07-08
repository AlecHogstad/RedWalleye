import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FORMAT_LABELS, type Match, type Side } from "../types";
import {
  allocateStrokes,
  computeMatchState,
  computeStableford,
  nassauSegmentValue,
  strokesOnHole,
  teamScoreKey,
  type ScoringContext,
} from "../scoring/engine";
import { usePlayerMap, useRoundContexts, useStore } from "../store/store";
import { CheckFlag } from "../components/CheckFlag";
import { FeedIcon } from "../components/Icons";

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
  const { state, setScore, updateSideGames, addMulligan, removeMulligan } =
    useStore();
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

  const matchState = useMemo(
    () => (match && ctx ? computeMatchState(match, state.players, ctx) : null),
    [match, state.players, ctx],
  );
  const alloc = useMemo(
    () => (match && ctx ? allocateStrokes(match, state.players, ctx) : null),
    [match, state.players, ctx],
  );
  const stablefordRows = useMemo(
    () => (match && ctx ? computeStableford(match, state.players, ctx) : []),
    [match, state.players, ctx],
  );

  if (!match || !round || !ctx || !alloc || !matchState) {
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
  const entitiesB = entitiesForSide(match, match.sideB, players);
  const teamA = teamMap[match.sideA.teamId];
  const teamB = teamMap[match.sideB.teamId];

  // Side games — per-group opt-ins + the current snake holder.
  const isScramble = match.format === "scramble";
  const sideGames = state.sideGames[match.id] ?? {};
  const groupPlayerIds = Array.from(
    new Set([...match.sideA.playerIds, ...match.sideB.playerIds]),
  );

  const strokesFor = (key: string) => {
    const total =
      match.format === "scramble"
        ? alloc.byTeam[key] ?? 0
        : alloc.byPlayer[key] ?? 0;
    return strokesOnHole(total, holeInfo.strokeIndex);
  };

  // Passing the snake to a new player counts as a three-putt, growing the
  // pot. Clearing it (or re-picking the same person) doesn't count.
  const passSnake = (value: string) => {
    const current = sideGames.snakeHolder ?? "";
    const changed = value !== "" && value !== current;
    updateSideGames(match!.id, {
      snakeHolder: value,
      ...(changed ? { snakeChanges: (sideGames.snakeChanges ?? 0) + 1 } : {}),
    });
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
          {val != null && match.format !== "scramble" ? `net ${val - s}` : ""}
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

  // Compact live score that sits between Prev / Next — the overall (match) bet
  // headline plus the running Nassau points.
  const navScore = (() => {
    if (matchState.thru === 0) {
      return { result: "—", sub: "not started", color: undefined, flag: false };
    }
    // Colour the result by the leading team's ACTUAL colour (A = orange,
    // B = green) so it matches the score-row dots and the leaderboard.
    const color =
      matchState.leader === "A"
        ? teamA?.color
        : matchState.leader === "B"
          ? teamB?.color
          : undefined;
    return {
      result: matchState.overall.resultText.replace(/ thru.*/, ""),
      sub: `${fmtPts(matchState.points.a)}–${fmtPts(matchState.points.b)} pts · ${
        matchState.complete ? "final" : `thru ${matchState.thru}`
      }`,
      color,
      flag: matchState.complete,
    };
  })();

  const segValue = nassauSegmentValue(match.format);

  const lastHole = ctx.course.holes.length;

  const holeGrid = (
    <div className="holegrid">
      {ctx.course.holes.map((h) => {
        const res = matchState.perHole.find((p) => p.hole === h.number);
        const win =
          res?.winner === "A"
            ? teamMap[match.sideA.teamId]?.color
            : res?.winner === "B"
              ? teamMap[match.sideB.teamId]?.color
              : res?.winner === "halve"
                ? "var(--muted)"
                : undefined;
        const scored = win !== undefined;
        return (
          <button
            key={h.number}
            className={h.number === hole ? "active" : ""}
            aria-label={`Hole ${h.number}${scored ? ", scored" : ""}`}
            aria-current={h.number === hole ? "true" : undefined}
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
  );

  const ticker = (
    <div className="ticker-wrap">
      <div className="ticker-label">Around the course</div>
      <div className="ticker" aria-label="Live activity from other groups">
        <div className="ticker-track">
          <span className="ticker-item ticker-placeholder">
            Live activity from the other groups will show here — coming soon
          </span>
          <span className="ticker-item ticker-placeholder" aria-hidden="true">
            Live activity from the other groups will show here — coming soon
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Green hero: format, rules, course, hole grid, live score */}
      <section className="score-hero">
        <Link className="badge" to="/rounds">
          ← Rounds
        </Link>
        <h2 className="hero-title">
          {teamA?.name} vs {teamB?.name} — {FORMAT_LABELS[match.format]}
        </h2>
        <p className="hero-course">
          {ctx.course.name}
          {ctx.tee ? ` - ${ctx.tee.name} Tees` : ""}
          {readOnly ? " · final (view only)" : ""}
        </p>
        {ticker}
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
          <div className="result" style={{ color: navScore.color }}>
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

      {/* Nassau — front 9, back 9, and the match are three separate bets */}
      <div className="section" style={{ paddingTop: 12 }}>
        <div className="card" style={{ padding: "12px 16px" }}>
          <div
            className="row"
            style={{ gap: 8, justifyContent: "space-between", textAlign: "center" }}
          >
            {(
              [
                { key: "front", label: "Front 9", st: matchState.front },
                { key: "back", label: "Back 9", st: matchState.back },
                { key: "match", label: "Match", st: matchState.overall },
              ] as const
            ).map(({ key, label, st }) => {
              const leadName =
                st.leader === "A" ? teamA?.name : st.leader === "B" ? teamB?.name : "";
              const line =
                st.thru === 0
                  ? "—"
                  : st.winner === "halve"
                    ? "Halved"
                    : st.leader
                      ? `${leadName} ${st.resultText}`
                      : st.resultText;
              const foot = st.complete
                ? `${fmtPts(st.points.a)}–${fmtPts(st.points.b)} pt`
                : `${segValue} pt${segValue > 1 ? "s" : ""} each`;
              return (
                <div key={key} style={{ flex: 1, minWidth: 0 }}>
                  <div className="hint" style={{ margin: 0 }}>
                    {label}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{line}</div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {foot}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Hole selection */}
      <div className="section" style={{ paddingTop: 12 }}>
        <div className="card" style={{ paddingBottom: 12 }}>
          {holeGrid}
        </div>
      </div>

      {/* Side games — opt in per group; never affect the tournament */}
      <div className="section" style={{ paddingTop: 4 }}>
        <h2>Side games</h2>
        <div className="card">
          {!isScramble && (
            <>
              <div className="field">
                <div className="sg-head">
                  <div className="sg-title">Stableford</div>
                  <div className="sg-sub">net points per hole</div>
                </div>
                <span className="spacer" />
                <Toggle
                  checked={!!sideGames.stableford}
                  onChange={(v) => updateSideGames(match.id, { stableford: v })}
                  label="Stableford"
                />
              </div>
              {sideGames.stableford && (
                <div className="sg-panel">
                  {stablefordRows.map((r) => {
                    const p = players[r.playerId];
                    const team = teamMap[p?.teamId ?? ""];
                    return (
                      <div className="sg-row" key={r.playerId}>
                        <span className="dot" style={{ background: team?.color }} />
                        <span className="sg-name">{p?.name ?? "?"}</span>
                        <span className="sg-thru">
                          {r.thru > 0 ? `thru ${r.thru}` : "—"}
                        </span>
                        <span className="sg-pts">{r.points}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {isScramble && (
            <>
              <div className="field">
                <div className="sg-head">
                  <div className="sg-title">Booze mulligans</div>
                  <div className="sg-sub">a shot buys a do-over</div>
                </div>
              </div>
              <div className="sg-panel">
                {groupPlayerIds.map((id) => {
                  const p = players[id];
                  const team = teamMap[p?.teamId ?? ""];
                  const count = state.activity.filter(
                    (e) =>
                      e.type === "mulligan" &&
                      e.matchId === match.id &&
                      e.playerId === id,
                  ).length;
                  return (
                    <div className="sg-row" key={id}>
                      <span className="dot" style={{ background: team?.color }} />
                      <span className="sg-name">{p?.name ?? "?"}</span>
                      <div className="stepper">
                        <button
                          onClick={() => removeMulligan(match.id, id)}
                          disabled={count === 0}
                          aria-label={`Remove a mulligan from ${p?.name ?? "player"}`}
                        >
                          −
                        </button>
                        <span className={`val ${count === 0 ? "empty" : ""}`}>
                          {count}
                        </span>
                        <button
                          onClick={() => addMulligan(match.id, id, hole)}
                          aria-label={`Add a mulligan for ${p?.name ?? "player"}`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className="field">
            <div className="sg-head">
              <div className="sg-title">Snake</div>
              <div className="sg-sub">last three-putt holds it</div>
            </div>
            <span className="spacer" />
            <Toggle
              checked={!!sideGames.snake}
              onChange={(v) => updateSideGames(match.id, { snake: v })}
              label="Snake"
            />
          </div>
          {sideGames.snake && (
            <div className="sg-panel">
              <div className="snake-badge">
                <FeedIcon kind="snake" size={18} />
                {sideGames.snakeHolder
                  ? `${players[sideGames.snakeHolder]?.name ?? "?"} has the snake`
                  : "nobody has the snake yet"}
              </div>
              <div className="sg-row">
                <span className="sg-name">Three-putts (pot)</span>
                <span className="sg-thru">tap to pass the snake</span>
                <span className="sg-pts">{sideGames.snakeChanges ?? 0}</span>
              </div>
              <div className="field">
                <label>Who has it?</label>
                <select
                  className="roster-select"
                  value={sideGames.snakeHolder ?? ""}
                  onChange={(e) => passSnake(e.target.value)}
                >
                  <option value="">Nobody yet</option>
                  {groupPlayerIds.map((id) => (
                    <option key={id} value={id}>
                      {players[id]?.name ?? "?"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
        <p className="hint">
          {isScramble
            ? "Side games are just for your group — mulligans post to the activity feed and none of this affects the tournament."
            : "Side games are just for your group — they never affect the tournament standings."}
        </p>
      </div>
    </>
  );
}

/** Small on/off switch. */
function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className={`switch ${disabled ? "disabled" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch-track">
        <span className="switch-thumb" />
      </span>
    </label>
  );
}

/** Format a points total, showing a half as .5 (e.g. 1.5) and whole otherwise. */
function fmtPts(p: number): string {
  return p % 1 === 0 ? String(p) : p.toFixed(1);
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
