import { Link } from "react-router-dom";

/**
 * Activity ticker — a scrollable feed of recent action across every group
 * (birdies, lead changes, closed-out matches...). The feed source and event
 * shapes are still being defined, so this is a scaffold: the header entry
 * point, route, and layout are in place, ready to be wired up.
 */
export default function TickerPage() {
  return (
    <>
      <div className="section" style={{ paddingBottom: 0 }}>
        <Link className="badge" to="/">
          ← Leaderboard
        </Link>
        <h2 style={{ marginTop: 10 }}>Activity</h2>
        <p className="hint" style={{ padding: "0 2px 8px" }}>
          Recent action from around the course — birdies, lead changes, and
          closed-out matches as scores land.
        </p>
      </div>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="card">
          <ul className="ticker-feed">
            <li className="ticker-feed-empty">
              Live activity feed coming soon — this is where the group chatter
              will scroll by.
            </li>
          </ul>
        </div>
      </section>
    </>
  );
}
