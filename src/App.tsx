import { NavLink, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import MatchPage from "./pages/MatchPage";
import TeamsPage from "./pages/TeamsPage";
import CoursePage from "./pages/CoursePage";

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <span className="flag">⛳</span>
        <h1>Red Walleye</h1>
        <span className="sub">Golf Trip</span>
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
          <span className="ico">🏆</span>
          Tournament
        </NavLink>
        <NavLink to="/teams">
          <span className="ico">👥</span>
          Teams
        </NavLink>
        <NavLink to="/course">
          <span className="ico">🗺️</span>
          Course
        </NavLink>
      </nav>
    </div>
  );
}
