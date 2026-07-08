import { Link } from "react-router-dom";

interface HubLink {
  to: string;
  title: string;
  desc: string;
}

const LINKS: HubLink[] = [
  { to: "/draft", title: "Draft", desc: "Captains draft the two teams" },
  { to: "/settings/teams", title: "Teams", desc: "Team names and rosters" },
  { to: "/settings/players", title: "Players", desc: "Add, edit, or remove golfers" },
  { to: "/settings/courses", title: "Courses", desc: "Pars, HDCP ranks, and tees" },
  { to: "/settings/reset", title: "Reset app data", desc: "Wipe scores and start over" },
];

export default function SettingsHubPage() {
  return (
    <>
      <div className="section">
        <h2>Settings</h2>
        <p className="hint" style={{ padding: "0 2px 8px" }}>
          Manage the trip setup — teams, players, and courses — plus the reset
          hatch when you need a clean slate.
        </p>
      </div>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="card">
          {LINKS.map((l) => (
            <Link key={l.to} className="settings-link" to={l.to}>
              <span className="settings-link-text">
                <span className="settings-link-title">{l.title}</span>
                <span className="settings-link-desc">{l.desc}</span>
              </span>
              <span className="settings-link-chevron" aria-hidden="true">
                ›
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="section">
        <Link className="btn ghost" to="/">
          Done
        </Link>
      </div>
    </>
  );
}
