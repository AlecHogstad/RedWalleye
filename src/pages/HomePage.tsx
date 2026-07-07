import { useMemo } from "react";
import { Link } from "react-router-dom";
import { FORMAT_SHORT, type Match, type Side } from "../types";
import { computeMatchState, computeStandings } from "../scoring/engine";
import { usePlayerMap, useStore } from "../store/store";
import { CheckFlag } from "../components/CheckFlag";

function sideNames(side: Side, players: ReturnType<typeof usePlayerMap>): string {
  return side.playerIds
    .map((id) => players[id]?.name ?? "?")
    .join(" / ");
}

export default function HomePage() {
  const { state } = useStore();
  const players = usePlayerMap();
  const teamMap = useMemo(
    () => Object.fromEntries(state.teams.map((t) => [t.id, t])),
    [state.teams],
  );

  const standings = useMemo(
    () => computeStandings(state.matches, state.players, state.course),
    [state.matches, state.players, state.course],
  );

  return (
    <>
      <section className="section">
        <h2>Leaderboard</h2>
        <div className="card">
          {standings.map((s, i) => {
            const team = teamMap[s.teamId];
            return (
              <div key={s.teamId} className="standing">
                <span className="rank">
                  {i === 0 && s.points > 0 ? <CheckFlag size={14} /> : i + 1}
                </span>
                <span className="dot" style={{ background: team?.color }} />
                <span style={{ flex: 1 }}>
                  <div className="team-name">{team?.name ?? s.teamId}</div>
                  <div className="team-meta">
                    {s.matchesComplete} final · {s.matchesPlayed} in play
                  </div>
                </span>
                <span className="pts">{s.points % 1 === 0 ? s.points : s.points.toFixed(1)}</span>
              </div>
            );
          })}
        </div>
        <p className="hint">
          1 point per match won, ½ for a halved match. Points lock in when a match is
          closed out or all 18 holes are entered.
        </p>
      </section>

      {state.rounds.map((round) => {
        const matches = state.matches.filter((m) => m.roundId === round.id);
        return (
          <section className="section" key={round.id}>
            <h2>
              {round.name}
              <span className="oval">{FORMAT_SHORT[round.format]}</span>
            </h2>
            <div className="card">
              {matches.map((m) => (
                <MatchRow key={m.id} match={m} players={players} teamMap={teamMap} />
              ))}
            </div>
          </section>
        );
      })}

      <p className="hint center">
        Tap any match to keep score. Everything saves on this phone automatically.
      </p>
    </>
  );
}

function MatchRow({
  match,
  players,
  teamMap,
}: {
  match: Match;
  players: ReturnType<typeof usePlayerMap>;
  teamMap: Record<string, { name: string; color: string }>;
}) {
  const { state } = useStore();
  const st = useMemo(
    () => computeMatchState(match, state.players, state.course),
    [match, state.players, state.course],
  );

  const leadClass = st.leader === "A" ? "leadA" : st.leader === "B" ? "leadB" : "";
  const colorA = teamMap[match.sideA.teamId]?.color;
  const colorB = teamMap[match.sideB.teamId]?.color;

  return (
    <Link className={`match ${st.complete ? "won" : ""}`} to={`/match/${match.id}`}>
      <div className="sides">
        <div className="side a">
          <div className="row" style={{ gap: 6 }}>
            <span className="dot" style={{ background: colorA }} />
            <span className="names">{sideNames(match.sideA, players)}</span>
          </div>
        </div>
        <div className="status">
          <div className={`result ${leadClass}`}>
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
    </Link>
  );
}
