import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import HomePage from "./pages/HomePage";
import MatchPage from "./pages/MatchPage";
import TeamsPage from "./pages/TeamsPage";
import CoursePage from "./pages/CoursePage";
import { PoleFlag } from "./components/CheckFlag";

/** Each screen gets its own block color, like the inspo phones. */
function themeFor(pathname: string): string {
  if (pathname.startsWith("/match")) return "theme-green";
  if (pathname.startsWith("/teams")) return "theme-blue";
  if (pathname.startsWith("/course")) return "theme-sand";
  return "theme-orange";
}

export default function App() {
  const { pathname } = useLocation();

  return (
    <div className={`app ${themeFor(pathname)}`}>
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
        <span className="est">est. 2026</span>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/match/:matchId" element={<MatchPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/course" element={<CoursePage />} />
        </Routes>
      </main>

      <nav className="tabbar">
        <NavLink to="/" end>
          <span className="tab-label">Tournament</span>
        </NavLink>
        <NavLink to="/teams">
          <span className="tab-label">Teams</span>
        </NavLink>
        <NavLink to="/course">
          <span className="tab-label">Course</span>
        </NavLink>
      </nav>
    </div>
  );
}
