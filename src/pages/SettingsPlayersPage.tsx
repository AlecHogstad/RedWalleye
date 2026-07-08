import { Link } from "react-router-dom";

export default function SettingsPlayersPage() {
  return (
    <>
      <div className="section" style={{ paddingBottom: 0 }}>
        <Link className="badge" to="/settings">
          ← Settings
        </Link>
        <h2 style={{ marginTop: 10 }}>Players</h2>
      </div>
    </>
  );
}
