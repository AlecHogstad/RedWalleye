import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store/store";

/** Compact relative time: "just now", "5m ago", "2h ago", "3d ago". */
function timeAgo(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Activity ticker — a scrollable feed of recent action across every group.
 * Today it surfaces scramble booze mulligans; more event types (birdies,
 * lead changes, closed-out matches) can be appended to the same log later.
 */
export default function TickerPage() {
  const navigate = useNavigate();
  const { state } = useStore();
  const now = Date.now();

  const playerMap = useMemo(
    () => Object.fromEntries(state.players.map((p) => [p.id, p])),
    [state.players],
  );
  const teamMap = useMemo(
    () => Object.fromEntries(state.teams.map((t) => [t.id, t])),
    [state.teams],
  );
  const matchMap = useMemo(
    () => Object.fromEntries(state.matches.map((m) => [m.id, m])),
    [state.matches],
  );
  const roundMap = useMemo(
    () => Object.fromEntries(state.rounds.map((r) => [r.id, r])),
    [state.rounds],
  );

  // Newest first.
  const feed = useMemo(
    () => [...state.activity].sort((a, b) => b.ts - a.ts),
    [state.activity],
  );

  // Return to wherever the ticker was opened from; fall back to the
  // leaderboard if there's no history (e.g. a deep link / hard refresh).
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  return (
    <>
      <div className="section" style={{ paddingBottom: 0 }}>
        <button className="badge" onClick={goBack}>
          ← Back
        </button>
        <h2 style={{ marginTop: 10 }}>Activity</h2>
        <p className="hint" style={{ padding: "0 2px 8px" }}>
          Recent action from around the course.
        </p>
      </div>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="card">
          <ul className="ticker-feed">
            {feed.length === 0 && (
              <li className="ticker-feed-empty">
                Nothing yet — booze mulligans and other action will scroll by
                here.
              </li>
            )}
            {feed.map((e) => {
              const player = playerMap[e.playerId];
              const team = player ? teamMap[player.teamId] : undefined;
              const match = matchMap[e.matchId];
              const round = match ? roundMap[match.roundId] : undefined;
              const where = [team?.name, round?.name]
                .filter(Boolean)
                .join(" · ");
              return (
                <li className="feed-item" key={e.id}>
                  <span className="feed-icon" aria-hidden="true">
                    🥃
                  </span>
                  <span className="feed-text">
                    <span className="feed-title">
                      {player?.name ?? "Someone"} took a booze mulligan
                    </span>
                    <span className="feed-sub">
                      {where}
                      {where ? " · " : ""}
                      {timeAgo(e.ts, now)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </>
  );
}
