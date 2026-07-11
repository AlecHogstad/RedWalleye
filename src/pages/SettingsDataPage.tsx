import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useStore, useRoundContexts } from "../store/store";
import { computeBestBallContributions } from "../scoring/engine";

// A tidy count: whole numbers plain, halves to one decimal.
const tidy = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(1));

/** Settings › Data — trip records derived from the scores. Today: who carried
 *  (and who didn't) in the best-ball rounds, by gross point contribution. */
export default function SettingsDataPage() {
  const { state } = useStore();
  const contexts = useRoundContexts();

  const rows = useMemo(
    () => computeBestBallContributions(state.matches, state.players, contexts),
    [state.matches, state.players, contexts],
  );

  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? id;
  const teamColor = (teamId: string) =>
    state.teams.find((t) => t.id === teamId)?.color ?? "transparent";

  const grid = { gridTemplateColumns: "22px 1fr 64px 64px" } as const;
  const least = rows[0];

  return (
    <>
      <div className="section" style={{ paddingBottom: 0 }}>
        <Link className="badge" to="/settings">
          ← Settings
        </Link>
        <h2 style={{ marginTop: 10 }}>Data</h2>
      </div>

      <section className="section" style={{ paddingTop: 8 }}>
        <div className="card" style={{ padding: "14px 16px" }}>
          <strong style={{ display: "block" }}>Best Ball — point contribution</strong>
          <p className="hint" style={{ margin: "6px 0 0", padding: 0 }}>
            Gross Nassau points each golfer's ball earned their team across the
            four-ball rounds — raw shots, no handicap. Each front / back /
            overall bet is split between partners by whose ball counted (the
            lower gross, a tie splitting the hole). The scramble isn't counted:
            one team ball, no individual scores.
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="hint" style={{ paddingTop: 14 }}>
            No four-ball scores entered yet — play some best ball and check back.
          </p>
        ) : (
          <>
            {least && (
              <div
                className="card"
                style={{ marginTop: 12, padding: "14px 16px", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}
              >
                <span>
                  <span className="pr-gross" style={{ display: "block" }}>
                    Least valuable
                  </span>
                  <strong style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 22 }}>
                    {name(least.playerId)}
                  </strong>
                </span>
                <span className="pr-cell">
                  <b>{tidy(least.points)}</b>
                  <span className="pr-gross">pts</span>
                </span>
              </div>
            )}

            <div className="card" style={{ marginTop: 12 }}>
              <div className="ptable-row ptable-head" style={grid}>
                <span>#</span>
                <span>Golfer</span>
                <span className="pr-cell">Pts</span>
                <span className="pr-cell">Carried</span>
              </div>
              {rows.map((r, i) => (
                <div className="ptable-row" key={r.playerId} style={grid}>
                  <span className="pr-gross">{i + 1}</span>
                  <span className="pt-name">
                    <span className="dot" style={{ background: teamColor(r.teamId) }} />
                    {name(r.playerId)}
                  </span>
                  <span className="pr-cell">
                    <b>{tidy(r.points)}</b>
                  </span>
                  <span className="pr-cell">
                    <b>{tidy(r.countingHoles)}</b>
                    <span className="pr-gross">of {r.holes}</span>
                  </span>
                </div>
              ))}
            </div>

            <p className="hint" style={{ paddingTop: 12 }}>
              <strong>Pts</strong> = gross best-ball points that golfer's ball
              earned (both partners on a side sum to the side's points).{" "}
              <strong>Carried</strong> = holes their ball was the team's counting
              (low) ball, of the four-ball holes they played; a tie with their
              partner counts as a half.
            </p>
          </>
        )}
      </section>
    </>
  );
}
