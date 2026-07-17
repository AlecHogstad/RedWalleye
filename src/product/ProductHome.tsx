import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { listMyEvents } from "./api";
import type { EventRow } from "./types";
import { Page, Card, colors, buttonStyle, ghostButtonStyle, StatusPill } from "./ui";

// Organizer home — the landing after sign-in. Lists the events you own and the
// one action that starts the wizard. Kept intentionally spare; the event
// dashboard is where the depth lives.

export default function ProductHome() {
  const { user, signOut } = useAuth();
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listMyEvents()
      .then((rows) => active && setEvents(rows))
      .catch((err) => active && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      active = false;
    };
  }, []);

  return (
    <Page>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>Your events</h1>
        <button
          type="button"
          onClick={() => void signOut()}
          style={{ ...ghostButtonStyle, fontSize: 13 }}
        >
          Sign out
        </button>
      </div>
      <p style={{ color: colors.muted, fontSize: 13, margin: "4px 0 20px" }}>
        {user?.email}
      </p>

      <Link to="/app/new" style={{ textDecoration: "none" }}>
        <button type="button" style={{ ...buttonStyle, width: "100%" }}>
          + New event
        </button>
      </Link>

      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
        {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}
        {events === null && !error && (
          <p style={{ color: colors.muted, fontSize: 14 }}>Loading…</p>
        )}
        {events !== null && events.length === 0 && (
          <p style={{ color: colors.muted, fontSize: 14 }}>
            No events yet. Create your first one above.
          </p>
        )}
        {events?.map((ev) => (
          <Link key={ev.id} to={`/app/event/${ev.id}`} style={{ textDecoration: "none" }}>
            <Card>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ color: colors.text, fontSize: 16, fontWeight: 600 }}>{ev.name}</div>
                <StatusPill status={ev.status} />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </Page>
  );
}
