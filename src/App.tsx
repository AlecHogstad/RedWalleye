import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation, Link } from "react-router-dom";
import HomePage from "./pages/HomePage";
import RoundsPage from "./pages/RoundsPage";
import MatchPage from "./pages/MatchPage";
import StartRoundPage from "./pages/StartRoundPage";
import MatchupsPage from "./pages/MatchupsPage";
import DraftPage from "./pages/DraftPage";
import SettingsHubPage from "./pages/SettingsHubPage";
import SettingsTeamsPage from "./pages/SettingsTeamsPage";
import SettingsPlayersPage from "./pages/SettingsPlayersPage";
import SettingsCoursesPage from "./pages/SettingsCoursesPage";
import SettingsResetPage from "./pages/SettingsResetPage";
import TickerPage from "./pages/TickerPage";
import { PoleFlag } from "./components/CheckFlag";
import { TrophyIcon, FlagIcon, GearIcon, TickerIcon } from "./components/Icons";
import { useStore } from "./store/store";
import { watchForUpdate } from "./sync/versionCheck";

/** Surfaces true once a newer build has been deployed so a stale device can
 *  refresh onto it — the whole group stays on one build. No-ops in dev. */
function useUpdateReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => watchForUpdate(() => setReady(true)), []);
  return ready;
}

/** Each screen gets its own block color, like the inspo phones. */
function themeFor(pathname: string): string {
  if (pathname.startsWith("/match")) return "theme-blue";
  if (pathname.startsWith("/settings")) return "theme-green";
  return "theme-green";
}

export default function App() {
  const { pathname } = useLocation();
  const { syncStatus } = useStore();
  const updateReady = useUpdateReady();
  // Scoring and the activity page drop the tab bar — the ← back pill is the
  // way out, and the reclaimed space keeps steppers clear of accidental taps.
  const showTabs =
    !pathname.startsWith("/match") &&
    !pathname.startsWith("/start") &&
    !pathname.startsWith("/matchups") &&
    !pathname.startsWith("/draft") &&
    !pathname.startsWith("/ticker");
  const onTicker = pathname.startsWith("/ticker");

  return (
    <div className={`app ${themeFor(pathname)} ${showTabs ? "" : "no-tabs"}`}>
      {updateReady && (
        <button
          className="update-banner"
          onClick={() => window.location.reload()}
        >
          New version available — tap to update
        </button>
      )}
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
        <Link
          to="/ticker"
          className={`header-btn ${onTicker ? "active" : ""}`}
          aria-label="Activity ticker"
        >
          <TickerIcon />
        </Link>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/rounds" element={<RoundsPage />} />
          <Route path="/start/:roundId" element={<StartRoundPage />} />
          <Route path="/matchups/:roundId" element={<MatchupsPage />} />
          <Route path="/draft" element={<DraftPage />} />
          <Route path="/match/:matchId" element={<MatchPage />} />
          <Route path="/settings" element={<SettingsHubPage />} />
          <Route path="/settings/teams" element={<SettingsTeamsPage />} />
          <Route path="/settings/players" element={<SettingsPlayersPage />} />
          <Route path="/settings/courses" element={<SettingsCoursesPage />} />
          <Route path="/settings/reset" element={<SettingsResetPage />} />
          <Route path="/ticker" element={<TickerPage />} />
        </Routes>
      </main>

      {showTabs && (
        <nav className="tabbar">
          <NavLink to="/" end>
            <span className="tab-inner">
              <span className="tab-icon">
                <TrophyIcon />
              </span>
              <span className="tab-label">Leaderboard</span>
            </span>
          </NavLink>
          <NavLink to="/rounds">
            <span className="tab-inner">
              <span className="tab-icon">
                <FlagIcon />
              </span>
              <span className="tab-label">Rounds</span>
            </span>
          </NavLink>
          <NavLink to="/settings">
            <span className="tab-inner">
              <span className="tab-icon">
                <GearIcon size={20} />
              </span>
              <span className="tab-label">Settings</span>
            </span>
          </NavLink>
        </nav>
      )}
    </div>
  );
}
