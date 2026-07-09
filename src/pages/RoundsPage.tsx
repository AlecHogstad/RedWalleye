import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FORMAT_LABELS, FORMAT_RULES, type Match, type Round, type Side } from "../types";
import { computeMatchState, computeStandings, isScrambleFieldMatch, scrambleGroupPlacementPoints, formatScrambleGroup, scrambleGroupNum, type ScoringContext } from "../scoring/engine";
import { useConfirm } from "../components/ConfirmDialog";
import { usePlayerMap, useRoundContexts, useStore } from "../store/store";
import { ROUND_DEFAULTS } from "../data/seed";
import { CheckFlag } from "../components/CheckFlag";
import { FinalStamp } from "../components/FinalStamp";

function sideNames(side: Side, players: ReturnType<typeof usePlayerMap>): string {
  return side.playerIds
    .map((id) => players[id]?.name ?? "?")
    .join(" / ");
}

/** Format a points total, showing a half as .5 (e.g. 1.5) and whole otherwise. */
function fmtPts(p: number): string {
  return p % 1 === 0 ? String(p) : p.toFixed(1);
}

/** Points with a proper ½ for the stamp ("8½"). */
function fmtHalf(n: number): string {
  const whole = Math.floor(n);
  const half = n - whole >= 0.5;
  if (whole === 0 && half) return "½";
  return `${whole}${half ? "½" : ""}`;
}

/** "Big Fish Golf Club" → "BIG FISH G.C." for the stamp's bottom ring. */
function stampCourse(name: string): string {
  return name.replace(/\s*golf club\s*$/i, " G.C.").toUpperCase();
}

/** The expected venue name for a round that hasn't been started yet,
 *  or "" when its default course isn't on this device. */
function pendingVenue(
  roundId: string,
  courses: { id: string; name: string }[],
): string {
  const def = ROUND_DEFAULTS[roundId];
  const course = def && courses.find((c) => c.id === def.courseId);
  return course ? course.name : "";
}

export default function RoundsPage() {
  const { state, finishRound, reopenRound } = useStore();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const players = usePlayerMap();
  const contexts = useRoundContexts();
  const teamMap = useMemo(
    () => Object.fromEntries(state.teams.map((t) => [t.id, t])),
    [state.teams],
  );

  const anyActive = state.rounds.some((r) => r.status === "active");

  const confirmFinish = async (round: Round) => {
    const matches = state.matches.filter((m) => m.roundId === round.id);
    const incomplete = matches.filter(
      (m) => !computeMatchState(m, state.players, contexts[round.id]).complete,
    ).length;
    const ok = await confirm({
      title: `Finish ${round.name}?`,
      message: "This unlocks the other rounds.",
      detail: incomplete > 0 ? `${incomplete} match(es) aren't finished.` : undefined,
      confirmLabel: "Finish round",
    });
    if (ok) finishRound(round.id);
  };

  return (
    <div className="rounds-page">
      {state.rounds.map((round, roundIndex) => {
        const matches = state.matches.filter((m) => m.roundId === round.id);
        const ctx = contexts[round.id];
        const locked = round.status === "pending" && anyActive;
        const startable = round.status === "pending" && !anyActive;

        // The verdict stamp for a finished round — winner's color, or ink on
        // a split. Per-round totals come from computeStandings scoped to just
        // this round's matches.
        let stamp: { teamName: string; color: string; scoreText: string } | null = null;
        if (round.status === "final") {
          const table = computeStandings(matches, state.players, { [round.id]: ctx });
          const a = table.find((t) => t.teamId === "tA")?.points ?? 0;
          const b = table.find((t) => t.teamId === "tB")?.points ?? 0;
          const winner = a > b ? teamMap.tA : b > a ? teamMap.tB : null;
          const hi = Math.max(a, b);
          const lo = Math.min(a, b);
          stamp = {
            teamName: winner?.name ?? "SPLIT",
            color: winner?.color ?? "#26301f",
            scoreText: `${fmtHalf(hi)}–${fmtHalf(lo)}`,
          };
        }

        return (
          <section className="section" key={round.id}>
            <div
              className={`round-card card ${round.status === "pending" ? "dimmed" : ""} ${
                round.status === "final" ? "final" : ""
              }`}
            >
              {stamp && (
                <FinalStamp
                  className="round-stamp"
                  roundLabel={round.name}
                  courseLabel={stampCourse(ctx.course.name)}
                  teamName={stamp.teamName}
                  color={stamp.color}
                  scoreText={stamp.scoreText}
                  seed={3 + roundIndex * 4}
                />
              )}
              <div className="round-card-head">
                <h2>
                  {round.name}: {FORMAT_LABELS[round.format]}
                  {round.status === "active" && <span className="oval live">Live</span>}
                  {/* Final rounds carry the verdict stamp instead of the oval */}
                  {round.status === "final" && !stamp && (
                    <span className="oval">
                      <CheckFlag size={9} /> Final
                    </span>
                  )}
                  {locked && <span className="oval muted-oval">Locked</span>}
                </h2>

                <p className="round-where">{FORMAT_RULES[round.format]}</p>

                {round.status !== "pending" ? (
                  <p className="round-where">
                    {ctx.course.name}
                    {ctx.tee ? ` · ${ctx.tee.name} tees (${ctx.tee.rating}/${ctx.tee.slope})` : ""}
                  </p>
                ) : (
                  pendingVenue(round.id, state.courses) && (
                    <p className="round-where">{pendingVenue(round.id, state.courses)}</p>
                  )
                )}
              </div>

              <div className="round-matches">
                {matches.map((m) => (
                  <MatchRow
                    key={m.id}
                    match={m}
                    roundMatches={matches}
                    players={players}
                    playerList={state.players}
                    teamMap={teamMap}
                    ctx={ctx}
                    clickable={round.status !== "pending"}
                  />
                ))}
              </div>

              {(round.status === "pending" ||
                startable ||
                round.status === "active" ||
                (round.status === "final" && !anyActive)) && (
                <div className="round-card-foot">
                  {round.status === "pending" && (
                    <button
                      className="btn ghost start"
                      onClick={() => navigate(`/matchups/${round.id}`)}
                    >
                      Set matchups
                    </button>
                  )}
                  {startable && (
                    <button className="btn start" onClick={() => navigate(`/start/${round.id}`)}>
                      Start {round.name}
                    </button>
                  )}
                  {round.status === "active" && (
                    <button className="btn ghost start" onClick={() => confirmFinish(round)}>
                      Finish {round.name}
                    </button>
                  )}
                  {round.status === "final" && !anyActive && (
                    <p className="hint center" style={{ padding: 0 }}>
                      Round is final.{" "}
                      <button className="linklike" onClick={() => reopenRound(round.id)}>
                        Reopen
                      </button>{" "}
                      if something needs fixing.
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>
        );
      })}

      <p className="hint center">
        One person starts each round (that's when the course and tees get picked).
        Scores sync live to every phone.
      </p>
    </div>
  );
}

function MatchRow({
  match,
  roundMatches,
  players,
  playerList,
  teamMap,
  ctx,
  clickable,
}: {
  match: Match;
  roundMatches: Match[];
  players: ReturnType<typeof usePlayerMap>;
  playerList: Parameters<typeof computeMatchState>[1];
  teamMap: Record<string, { name: string; color: string }>;
  ctx: ScoringContext;
  clickable: boolean;
}) {
  const st = useMemo(
    () => computeMatchState(match, playerList, ctx),
    [match, playerList, ctx],
  );

  const field = isScrambleFieldMatch(match);
  const colorA = teamMap[match.sideA.teamId]?.color;
  const colorB = teamMap[match.sideB.teamId]?.color;
  const placementPts = field ? scrambleGroupPlacementPoints(match, roundMatches, ctx) : null;
  const groupNum = field ? scrambleGroupNum(match.id, roundMatches) : null;
  const matchNum = String(
    roundMatches.findIndex((m) => m.id === match.id) + 1,
  ).padStart(2, "0");
  const leadColor =
    st.leader === "A" ? colorA : st.leader === "B" ? colorB : undefined;

  const body = field ? (
    <div className="sides">
      <div className="side a" style={{ flex: 1 }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="dot" style={{ background: colorA }} />
          <span className="names">
            {groupNum ? `${formatScrambleGroup(groupNum)} · ` : ""}
            {sideNames(match.sideA, players)}
          </span>
        </div>
      </div>
      <div className="status">
        <div className="result" style={{ color: colorA }}>
          {st.thru === 0 ? "—" : st.overall.resultText.replace(/ thru.*/, "")}
        </div>
        <div className="lead">
          {st.thru === 0 ? (
            "not started"
          ) : (
            <>
              {st.complete && <CheckFlag size={10} />}{" "}
              {placementPts != null
                ? `${fmtPts(placementPts)} pts · final`
                : st.complete
                  ? "18 holes · final"
                  : `thru ${st.thru}`}
            </>
          )}
        </div>
      </div>
    </div>
  ) : (
    <div className="sides">
      <div className="side a">
        <div className="row" style={{ gap: 6 }}>
          <span className="dot" style={{ background: colorA }} />
          <span className="names">
            Match {matchNum} · {sideNames(match.sideA, players)}
          </span>
        </div>
      </div>
      <div className="status">
        <div className="result" style={{ color: leadColor }}>
          {st.thru === 0 ? "—" : st.overall.resultText.replace(/ thru.*/, "")}
        </div>
        <div className="lead">
          {st.thru === 0 ? (
            "not started"
          ) : (
            <>
              {st.complete && <CheckFlag size={10} />} {fmtPts(st.points.a)}–
              {fmtPts(st.points.b)} pts · {st.complete ? "final" : `thru ${st.thru}`}
            </>
          )}
        </div>
      </div>
      <div className="side b">
        <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
          <span className="names">{sideNames(match.sideB, players)}</span>
          <span className="dot" style={{ background: colorB }} />
        </div>
      </div>
    </div>
  );

  if (!clickable) {
    return <div className={`match ${st.complete ? "won" : ""}`}>{body}</div>;
  }
  return (
    <Link className={`match ${st.complete ? "won" : ""}`} to={`/match/${match.id}`}>
      {body}
    </Link>
  );
}
