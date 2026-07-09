import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { type Match, type Side, FORMAT_LABELS, FORMAT_RULE_SECTIONS } from "../types";
import {
  allocateStrokes,
  computeMatchState,
  computeStableford,
  formatScrambleGroup,
  isScrambleFieldMatch,
  nassauSegmentValue,
  scrambleGroupNum,
  scrambleGroupPlacementPoints,
  strokesOnHole,
  teamScoreKey,
  type ScoringContext,
} from "../scoring/engine";
import { usePlayerMap, useRoundContexts, useStore } from "../store/store";
import { CheckFlag } from "../components/CheckFlag";
import { ActivityTicker } from "../components/ActivityTicker";
import { MulliganCamera } from "../components/MulliganCamera";
import { RulesArt } from "../components/RulesArt";

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
  teamMap: Record<string, { name: string } | undefined>,
): ScoreEntity[] {
  if (match.format === "scramble") {
    if (side.playerIds.length === 0) return [];
    const members = side.playerIds.map((id) => players[id]?.name ?? "?").join(" + ");
    return [
      {
        key: teamScoreKey(side.teamId),
        label: teamMap[side.teamId]?.name ?? "Team",
        hint: members,
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
  const { state, setScore, updateSideGames, addMulligan, removeMulligan, attachMulliganPhoto } =
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
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoEventId, setPhotoEventId] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [proofSheet, setProofSheet] = useState<{
    eventId: string;
    playerName: string;
  } | null>(null);

  // In-app Evidence Camera when the browser has one; the hidden native input
  // stays as the fallback (permission denied, unsupported browser).
  const [cameraFor, setCameraFor] = useState<{ eventId: string; playerName: string } | null>(
    null,
  );
  const [rulesOpen, setRulesOpen] = useState(false);

  const openPhotoPicker = (eventId: string) => {
    setPhotoEventId(eventId);
    photoInputRef.current?.click();
  };

  const openProofCapture = (eventId: string, playerName: string) => {
    if (typeof navigator.mediaDevices?.getUserMedia === "function") {
      setCameraFor({ eventId, playerName });
    } else {
      openPhotoPicker(eventId);
    }
  };

  const attachProof = async (eventId: string, file: File) => {
    setPhotoBusy(true);
    try {
      await attachMulliganPhoto(eventId, file);
      setCameraFor(null);
      setProofSheet(null);
    } catch (err) {
      console.error("[mulligan-photo] attach failed:", err);
    } finally {
      setPhotoBusy(false);
    }
  };

  const onPhotoPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const eventId = photoEventId;
    setPhotoEventId(null);
    if (!file || !eventId) return;
    await attachProof(eventId, file);
  };

  const logMulligan = (matchId: string, playerId: string) => {
    const eventId = addMulligan(matchId, playerId, hole);
    setProofSheet({
      eventId,
      playerName: players[playerId]?.name ?? "the cheater",
    });
  };

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
  const entitiesA = entitiesForSide(match, match.sideA, players, teamMap);
  const entitiesB = entitiesForSide(match, match.sideB, players, teamMap);
  const teamA = teamMap[match.sideA.teamId];
  const teamB = teamMap[match.sideB.teamId];

  // Side games — per-group opt-ins + the current snake holder.
  const isScramble = match.format === "scramble";
  const isFieldScramble = isScrambleFieldMatch(match);
  const sideGames = state.sideGames[match.id] ?? {};
  const groupPlayerIds = isFieldScramble
    ? match.sideA.playerIds
    : Array.from(new Set([...match.sideA.playerIds, ...match.sideB.playerIds]));
  const roundMatches = state.matches.filter((m) => m.roundId === match.roundId);
  const placementPts = isFieldScramble
    ? scrambleGroupPlacementPoints(match, roundMatches, ctx)
    : null;
  const roundNum = String(
    state.rounds.findIndex((r) => r.id === round.id) + 1,
  ).padStart(2, "0");
  const matchNum = String(
    roundMatches.findIndex((m) => m.id === match.id) + 1,
  ).padStart(2, "0");
  const groupNum = scrambleGroupNum(match.id, roundMatches);
  const namesOnSide = (side: typeof match.sideA) =>
    side.playerIds.map((id) => players[id]?.name ?? "?").join(" + ");
  const matchPlayers = isFieldScramble
    ? `${teamA?.name ?? "Team"} · ${namesOnSide(match.sideA)}`
    : `${namesOnSide(match.sideA)} vs ${namesOnSide(match.sideB)}`;
  const heroSlot =
    isFieldScramble && groupNum
      ? formatScrambleGroup(groupNum)
      : `Match ${matchNum}`;

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

  const renderScrambleRow = (e: ScoreEntity) => {
    const val = match.scores[e.key]?.[hole];
    return (
      <div className="score-row score-row-scramble" key={e.key}>
        <div className="scramble-score">
          {readOnly ? (
            <span className={`val-final lg ${val == null ? "empty" : ""}`}>{val ?? "–"}</span>
          ) : (
            <div className="stepper stepper-lg">
              <button onClick={() => bump(e.key, -1)} aria-label={`Subtract a stroke for ${e.label}`}>
                −
              </button>
              <span className={`val ${val == null ? "empty" : ""}`}>{val ?? "–"}</span>
              <button onClick={() => bump(e.key, +1)} aria-label={`Add a stroke for ${e.label}`}>
                +
              </button>
            </div>
          )}
        </div>
        <div className="scramble-team">
          <div className="who">
            <div className="n">{e.label}</div>
            <div className="h">{e.hint}</div>
          </div>
        </div>
      </div>
    );
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
        {readOnly ? (
          <span className={`val-final ${val == null ? "empty" : ""}`}>{val ?? "–"}</span>
        ) : (
          <div className="stepper">
            <button onClick={() => bump(e.key, -1)} aria-label={`Subtract a stroke for ${e.label}`}>
              −
            </button>
            <span className={`val ${val == null ? "empty" : ""}`}>{val ?? "–"}</span>
            <button onClick={() => bump(e.key, +1)} aria-label={`Add a stroke for ${e.label}`}>
              +
            </button>
          </div>
        )}
      </div>
    );
  };

  // Compact live score that sits between Prev / Next — the overall (match) bet
  // headline plus the running Nassau points.
  const navScore = (() => {
    if (matchState.thru === 0) {
      return { result: "—", sub: "not started", color: undefined, flag: false };
    }
    if (isFieldScramble) {
      return {
        result: matchState.overall.resultText.replace(/ thru.*/, ""),
        sub:
          placementPts != null
            ? `${fmtPts(placementPts)} pts · final`
            : matchState.complete
              ? "18 holes · final"
              : `thru ${matchState.thru}`,
        color: teamA?.color,
        flag: matchState.complete,
      };
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
        const win = isFieldScramble
          ? match.scores[teamScoreKey(match.sideA.teamId)]?.[h.number] != null
            ? teamMap[match.sideA.teamId]?.color
            : undefined
          : res?.winner === "A"
            ? teamMap[match.sideA.teamId]?.color
            : res?.winner === "B"
              ? teamMap[match.sideB.teamId]?.color
              : res?.winner === "halve"
                ? "var(--muted)"
                : undefined;
        const scored = isFieldScramble
          ? match.scores[teamScoreKey(match.sideA.teamId)]?.[h.number] != null
          : win !== undefined;
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
    <ActivityTicker roundId={match.roundId} excludeMatchId={match.id} />
  );

  const nassauCard = !isScramble && (
    <div className="card score-hero-nassau">
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
  );

  return (
    <>
      {/* Green hero: format, rules, course, hole grid, live score */}
      <section className="score-hero">
        <h2 className="hero-title">
          Round {roundNum}, {heroSlot}
        </h2>
        <p className="hero-players">{matchPlayers}</p>
        <p className="hero-course round-meta-row">
          <span>
            {ctx.course.name}
            {ctx.tee ? ` - ${ctx.tee.name} Tees` : ""}
            {readOnly ? " · final (view only)" : ""}
          </span>
          <button
            type="button"
            className="linklike round-scoring-link hero-scoring-link"
            onClick={() => setRulesOpen(true)}
          >
            View Scoring Rules
          </button>
        </p>
        {nassauCard}
        {ticker}
      </section>

      {/* Cream body: current hole, score rows, prev/score/next */}
      <div className={`hole-head${isFieldScramble ? " hole-head-scramble" : ""}`}>
        <div className="hole-head-copy">
          <h2 className="hole-num">
            Hole {String(hole).padStart(2, "0")}
            {readOnly && (
              <span className="oval">
                <CheckFlag size={9} /> Final
              </span>
            )}
          </h2>
          <p className="hole-meta">
            Par {holeInfo.par}
            {holeInfo.yards ? ` - ${holeInfo.yards} yards` : ""} - HDCP{" "}
            {holeInfo.strokeIndex}
          </p>
        </div>
        {isFieldScramble && (
          <div className="hole-head-score">
            <div className="result" style={{ color: navScore.color }}>
              {navScore.flag && <CheckFlag size={13} />} {navScore.result}
            </div>
          </div>
        )}
      </div>

      <div className="card match-score-card">
        {entitiesA.map(isScramble ? renderScrambleRow : renderRow)}
        {entitiesB.length > 0 && (
          <>
            <div style={{ height: 6, background: "var(--cream)" }} />
            {entitiesB.map(isScramble ? renderScrambleRow : renderRow)}
          </>
        )}
      </div>

      {/* Prev / live score / Next */}
      <div className={`hole-nav${isFieldScramble ? " hole-nav-scramble" : ""}`}>
        <button
          className="navbtn"
          disabled={hole <= 1}
          onClick={() => setHole((h) => Math.max(1, h - 1))}
        >
          Prev
        </button>
        {!isFieldScramble && (
          <div className="nav-score">
            <div className="result" style={{ color: navScore.color }}>
              {navScore.flag && <CheckFlag size={13} />} {navScore.result}
            </div>
            {navScore.sub && <div className="sub">{navScore.sub}</div>}
          </div>
        )}
        <button
          className="navbtn next"
          disabled={hole >= lastHole}
          onClick={() => setHole((h) => Math.min(lastHole, h + 1))}
        >
          Next
        </button>
      </div>

      {isFieldScramble && placementPts != null && (
        <div className="section" style={{ paddingTop: 12 }}>
          <div className="card" style={{ padding: "12px 16px", textAlign: "center" }}>
            <div className="hint" style={{ margin: 0 }}>
              Round placement
            </div>
            <div style={{ fontWeight: 800, fontSize: 22, fontFamily: "var(--font-display)" }}>
              {fmtPts(placementPts)} pts
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              1st = 6 · 2nd = 4 · 3rd = 2 · 4th = 0
            </div>
          </div>
        </div>
      )}

      {/* Hole selection — duplicate block removed below; keep one */}
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
                  <p className="sg-desc">
                    Every hole adds points from your net score. Eagle 4, birdie 3,
                    par 2, bogey 1, double+ 0. Highest total wins.
                  </p>
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
                          disabled={count === 0 || readOnly}
                          aria-label={`Remove a mulligan from ${p?.name ?? "player"}`}
                        >
                          −
                        </button>
                        <span className={`val ${count === 0 ? "empty" : ""}`}>
                          {count}
                        </span>
                        <button
                          onClick={() => logMulligan(match.id, id)}
                          disabled={readOnly}
                          aria-label={`Add a mulligan for ${p?.name ?? "player"}`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={onPhotoPicked}
              />
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

      {rulesOpen && (
        <>
          <button
            type="button"
            className="sheet-backdrop"
            aria-label="Dismiss"
            onClick={() => setRulesOpen(false)}
          />
          <div
            className="bottom-sheet rules-sheet"
            role="dialog"
            aria-labelledby="match-scoring-sheet-title"
          >
            <div className="rules-sheet-body">
              <div className="rules-sheet-content">
                <RulesArt format={round.format} className="rules-art" />
                <h3 id="match-scoring-sheet-title" className="bottom-sheet-title">
                  {round.name}: {FORMAT_LABELS[round.format]}
                </h3>
                <div className="rules-sections">
                  {FORMAT_RULE_SECTIONS[round.format].map((s) => (
                    <div className="rules-section" key={s.label}>
                      <span className="rules-section-label">{s.label}</span>
                      <p className="rules-section-text">{s.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn ghost bottom-sheet-skip"
              onClick={() => setRulesOpen(false)}
            >
              Got It
            </button>
          </div>
        </>
      )}

      {proofSheet && (
        <>
          <button
            type="button"
            className="sheet-backdrop"
            aria-label="Dismiss"
            onClick={() => setProofSheet(null)}
          />
          <div
            className="bottom-sheet"
            role="dialog"
            aria-labelledby="proof-sheet-title"
          >
            <h3 id="proof-sheet-title" className="bottom-sheet-title">
              We need proof
            </h3>
            <p className="bottom-sheet-copy">
              Take a photo of {proofSheet.playerName}.
            </p>
            <button
              type="button"
              className="btn start"
              disabled={photoBusy}
              onClick={() => openProofCapture(proofSheet.eventId, proofSheet.playerName)}
            >
              {photoBusy ? "Uploading…" : "Take photo"}
            </button>
            <button
              type="button"
              className="btn ghost bottom-sheet-skip"
              disabled={photoBusy}
              onClick={() => setProofSheet(null)}
            >
              Not now
            </button>
          </div>
        </>
      )}

      {cameraFor && (
        <MulliganCamera
          playerName={cameraFor.playerName}
          busy={photoBusy}
          onCapture={(file) => void attachProof(cameraFor.eventId, file)}
          onFallback={() => {
            const id = cameraFor.eventId;
            setCameraFor(null);
            openPhotoPicker(id);
          }}
          onClose={() => setCameraFor(null)}
        />
      )}
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
