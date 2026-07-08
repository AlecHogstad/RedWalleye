import { useMemo } from "react";
import { computePlayerTotals, computeStandings, type RoundTotals } from "../scoring/engine";
import { useRoundContexts, useStore } from "../store/store";
import { CheckFlag } from "../components/CheckFlag";

/** Leaderboard: team standings on top, all 16 players with per-round
 *  gross & net below. */
export default function HomePage() {
  const { state } = useStore();
  const contexts = useRoundContexts();
  const teamMap = useMemo(
    () => Object.fromEntries(state.teams.map((t) => [t.id, t])),
    [state.teams],
  );

  const standings = useMemo(
    () => computeStandings(state.matches, state.players, contexts),
    [state.matches, state.players, contexts],
  );

  // Individual stats only make sense where everyone plays their own ball —
  // scramble rounds (one team ball) are left out of the player table.
  const statRounds = useMemo(
    () => state.rounds.filter((r) => r.format !== "scramble"),
    [state.rounds],
  );

  // player id -> per-round totals
  const totals = useMemo(() => {
    const byPlayer: Record<string, Record<string, RoundTotals | null>> = {};
    for (const p of state.players) {
      byPlayer[p.id] = {};
      for (const r of statRounds) {
        const match = state.matches.find(
          (m) =>
            m.roundId === r.id &&
            (m.sideA.playerIds.includes(p.id) || m.sideB.playerIds.includes(p.id)),
        );
        byPlayer[p.id][r.id] = match
          ? computePlayerTotals(match, p.id, state.players, contexts[r.id])
          : null;
      }
    }
    return byPlayer;
  }, [state.players, statRounds, state.matches, contexts]);

  const tableGrid = { gridTemplateColumns: `1fr ${statRounds.map(() => "64px").join(" ")}` };

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
          Every match is a Nassau — front 9, back 9, and the match each score
          points (halved bets split). Round 1: 1 point per bet (12 total).
          Rounds 2 &amp; 3: 2 points per bet (12 each). 36 points on the trip;
          each bet locks as it finishes.
        </p>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <h2>Players</h2>
        <div className="card">
          <div className="ptable-row ptable-head" style={tableGrid}>
            <span>Player</span>
            {statRounds.map((r) => (
              <span key={r.id} className="pr-cell">
                {r.name.replace("Round ", "R")}
              </span>
            ))}
          </div>
          {state.teams.map((team) =>
            state.players
              .filter((p) => p.teamId === team.id)
              .map((p) => (
                <div className="ptable-row" key={p.id} style={tableGrid}>
                  <span className="pt-name">
                    <span className="dot" style={{ background: team.color }} />
                    {p.name}
                  </span>
                  {statRounds.map((r) => {
                    const t = totals[p.id]?.[r.id];
                    return (
                      <span key={r.id} className="pr-cell">
                        {t ? (
                          <>
                            <b>{t.net}</b>
                            <span className="pr-gross">
                              {t.gross}
                              {t.thru < 18 ? ` ·${t.thru}` : ""}
                            </span>
                          </>
                        ) : (
                          <span className="pr-empty">—</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              )),
          )}
        </div>
        <p className="hint">
          Big number = net, small = gross (·n = thru n holes). Net uses each
          player's full course handicap for that round's tees. The scramble
          round isn't shown — one team ball, no individual scores.
        </p>
      </section>
    </>
  );
}
