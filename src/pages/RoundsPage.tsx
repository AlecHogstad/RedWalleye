import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FORMAT_SHORT, type Match, type Round, type Side } from "../types";
import {
  computeMatchState,
  computeStrokePlay,
  type ScoringContext,
} from "../scoring/engine";
import { usePlayerMap, useRoundContexts, useStore } from "../store/store";
import { ROUND_DEFAULTS } from "../data/seed";
import { CheckFlag } from "../components/CheckFlag";

function sideNames(side: Side, players: ReturnType<typeof usePlayerMap>): string {
  return side.playerIds
    .map((id) => players[id]?.name ?? "?")
    .join(" / ");
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
  const navigate = useNavigate();
  const players = usePlayerMap();
  const contexts = useRoundContexts();
  const teamMap = useMemo(
    () => Object.fromEntries(state.teams.map((t) => [t.id, t])),
    [state.teams],
  );

  const anyActive = state.rounds.some((r) => r.status === "active");

  const confirmFinish = (round: Round) => {
    const matches = state.matches.filter((m) => m.roundId === round.id);
    const incomplete = matches.filter((m) =>
      round.format === "fourman"
        ? !computeStrokePlay(m, state.players, contexts[round.id]).complete
        : !computeMatchState(m, state.players, contexts[round.id]).complete,
    ).length;
    const what = round.format === "fourman" ? "team card(s)" : "match(es)";
    const warn = incomplete > 0 ? `\n\n${incomplete} ${what} aren't finished.` : "";
    if (window.confirm(`Finish ${round.name}? This unlocks the other rounds.${warn}`)) {
      finishRound(round.id);
    }
  };

  return (
    <>
      {state.rounds.map((round) => {
        const matches = state.matches.filter((m) => m.roundId === round.id);
        const ctx = contexts[round.id];
        const locked = round.status === "pending" && anyActive;
        const startable = round.status === "pending" && !anyActive;

        return (
          <section className="section" key={round.id}>
            <h2>
              {round.name}
              <span className="oval">{FORMAT_SHORT[round.format]}</span>
              {round.status === "active" && <span className="oval live">Live</span>}
              {round.status === "final" && (
                <span className="oval">
                  <CheckFlag size={9} /> Final
                </span>
              )}
              {locked && <span className="oval muted-oval">Locked</span>}
            </h2>

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
            {round.format === "fourman" && (
              <p className="round-where">
                Every team tees off as its own group — best net ball per hole,
                low team total wins the round.
              </p>
            )}

            <div className={`card ${round.status === "pending" ? "dimmed" : ""}`}>
              {matches.map((m) =>
                round.format === "fourman" ? (
                  <TeamEntryRow
                    key={m.id}
                    match={m}
                    players={players}
                    teamMap={teamMap}
                    ctx={ctx}
                    clickable={round.status !== "pending"}
                  />
                ) : (
                  <MatchRow
                    key={m.id}
                    match={m}
                    players={players}
                    teamMap={teamMap}
                    ctx={ctx}
                    clickable={round.status !== "pending"}
                  />
                ),
              )}
            </div>

            {startable && (
              <button className="btn start" onClick={() => navigate(`/start/${round.id}`)}>
                Start {round.name}
              </button>
            )}
            {locked && (
              <p className="hint center" style={{ paddingTop: 8 }}>
                Locked while another round is live.
              </p>
            )}
            {round.status === "active" && (
              <button className="btn ghost start" onClick={() => confirmFinish(round)}>
                Finish {round.name}
              </button>
            )}
            {round.status === "final" && !anyActive && (
              <p className="hint center" style={{ paddingTop: 8 }}>
                Round is final.{" "}
                <button className="linklike" onClick={() => reopenRound(round.id)}>
                  Reopen
                </button>{" "}
                if something needs fixing.
              </p>
            )}
          </section>
        );
      })}

      <p className="hint center">
        One person starts each round (that's when the course and tees get picked).
        Scores sync live to every phone.
      </p>
    </>
  );
}

function MatchRow({
  match,
  players,
  teamMap,
  ctx,
  clickable,
}: {
  match: Match;
  players: ReturnType<typeof usePlayerMap>;
  teamMap: Record<string, { name: string; color: string }>;
  ctx: ScoringContext;
  clickable: boolean;
}) {
  const { state } = useStore();
  const st = useMemo(
    () => computeMatchState(match, state.players, ctx),
    [match, state.players, ctx],
  );

  const colorA = teamMap[match.sideA.teamId]?.color;
  const colorB = teamMap[match.sideB.teamId]?.color;
  const leadColor =
    st.leader === "A" ? colorA : st.leader === "B" ? colorB : undefined;

  const body = (
    <div className="sides">
      <div className="side a">
        <div className="row" style={{ gap: 6 }}>
          <span className="dot" style={{ background: colorA }} />
          <span className="names">{sideNames(match.sideA, players)}</span>
        </div>
      </div>
      <div className="status">
        <div className="result" style={{ color: leadColor }}>
          {st.thru === 0 ? "—" : st.resultText.replace(/ thru.*/, "")}
        </div>
        <div className="lead">
          {st.thru === 0 ? (
            "not started"
          ) : st.complete ? (
            <>
              <CheckFlag size={10} /> final
            </>
          ) : (
            `thru ${st.thru}`
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

/** One team's stroke-play card in the fourman round. */
function TeamEntryRow({
  match,
  players,
  teamMap,
  ctx,
  clickable,
}: {
  match: Match;
  players: ReturnType<typeof usePlayerMap>;
  teamMap: Record<string, { name: string; color: string }>;
  ctx: ScoringContext;
  clickable: boolean;
}) {
  const { state } = useStore();
  const st = useMemo(
    () => computeStrokePlay(match, state.players, ctx),
    [match, state.players, ctx],
  );
  const team = teamMap[match.sideA.teamId];

  const body = (
    <div className="sides">
      <div className="side a" style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}>
          <span className="dot" style={{ background: team?.color }} />
          <span style={{ fontWeight: 700, flex: "none" }}>{team?.name}</span>
          <span
            className="muted"
            style={{
              fontSize: 12.5,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {sideNames(match.sideA, players)}
          </span>
        </div>
      </div>
      <div className="status">
        <div className="result">{st.thru === 0 ? "—" : st.toParText}</div>
        <div className="lead">
          {st.thru === 0 ? (
            "not started"
          ) : st.complete ? (
            <>
              <CheckFlag size={10} /> net {st.netTotal}
            </>
          ) : (
            `thru ${st.thru}`
          )}
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
