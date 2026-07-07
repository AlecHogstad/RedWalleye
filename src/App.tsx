import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import HomePage from "./pages/HomePage";
import RoundsPage from "./pages/RoundsPage";
import MatchPage from "./pages/MatchPage";
import TeamsPage from "./pages/TeamsPage";
import CoursePage from "./pages/CoursePage";
import StartRoundPage from "./pages/StartRoundPage";
import { PoleFlag } from "./components/CheckFlag";
import { useStore } from "./store/store";

/** Each screen gets its own block color, like the inspo phones. */
function themeFor(pathname: string): string {
  if (pathname.startsWith("/match")) return "theme-green";
  if (pathname.startsWith("/teams")) return "theme-blue";
  if (pathname.startsWith("/course")) return "theme-sand";
  return "theme-orange";
}

export default function App() {
  const { pathname } = useLocation();
  const { syncStatus } = useStore();
  // Scoring pages drop the tab bar — the ← Tournament pill is the way back,
  // and the reclaimed space keeps steppers clear of accidental tab taps.
  const showTabs = !pathname.startsWith("/match");

  return (
    <div className={`app ${themeFor(pathname)} ${showTabs ? "" : "no-tabs"}`}>
      <header className="topbar">
        <div className="lockup" aria-label="RWGC — Red Walleye Golf Club">
          <PoleFlag />
          <span>RW</span>
          <span>GC</span>
        </div>
        <div className="wordmark">
          Red Walleye
          <br />
          Golf Club
        </div>
        <span className="spacer" />
        {syncStatus === "local" ? (
          <span className="est">est. 2026</span>
        ) : (
          <span className={`sync ${syncStatus}`}>
            ● {syncStatus === "online" ? "live" : "offline"}
          </span>
        )}
      </header>

      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/rounds" element={<RoundsPage />} />
          <Route path="/start/:roundId" element={<StartRoundPage />} />
          <Route path="/match/:matchId" element={<MatchPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/course" element={<CoursePage />} />
        </Routes>
      </main>

      {showTabs && (
        <nav className="tabbar">
          <NavLink to="/" end>
            <span className="tab-label">Leaderboard</span>
          </NavLink>
          <NavLink to="/rounds">
            <span className="tab-label">Rounds</span>
          </NavLink>
          <NavLink to="/teams">
            <span className="tab-label">Teams</span>
          </NavLink>
          <NavLink to="/course">
            <span className="tab-label">Course</span>
          </NavLink>
        </nav>
      )}
    </div>
  );
}
