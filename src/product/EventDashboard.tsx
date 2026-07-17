import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getEventById } from "./api";
import type { EventRow } from "./types";
import RoundsSection from "./RoundsSection";
import TeamsRosterSection from "./TeamsRosterSection";
import EventDetailsCard from "./EventDetailsCard";
import { Page, Card, colors, ghostButtonStyle, buttonStyle, StatusPill } from "./ui";

// Event dashboard — where an organizer lands after creating an event and the
// hub the wizard's later steps hang off. This first slice confirms the row
// exists and surfaces the live share link + join code (spec §9 step 5). Rounds,
// teams, roster, and pairings get their sections here as they're built.

function shareUrl(code: string): string {
  const base = window.location.href.split("#")[0];
  return `${base}#/j/${code}`;
}

export default function EventDashboard() {
  const { eventId } = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<EventRow | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    let active = true;
    getEventById(eventId)
      .then((ev) => active && setEvent(ev))
      .catch((err) => active && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      active = false;
    };
  }, [eventId]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Page>
      <Link to="/app" style={{ textDecoration: "none" }}>
        <button type="button" style={{ ...ghostButtonStyle, marginBottom: 20 }}>
          ← All events
        </button>
      </Link>

      {error && <p style={{ color: colors.danger, fontSize: 14 }}>{error}</p>}
      {event === undefined && !error && (
        <p style={{ color: colors.muted, fontSize: 14 }}>Loading…</p>
      )}
      {event === null && !error && (
        <p style={{ color: colors.muted, fontSize: 14 }}>Event not found.</p>
      )}

      {event && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <h1 style={{ fontSize: 24, margin: 0 }}>{event.name}</h1>
            <StatusPill status={event.status} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <EventDetailsCard
            event={event}
            editable={event.status === "draft"}
            onSaved={setEvent}
          />

          <Card>
            <div style={{ fontSize: 13, color: colors.muted, marginBottom: 8 }}>
              Share link — anyone with this can join
            </div>
            <div
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 13,
                color: colors.text,
                wordBreak: "break-all",
                marginBottom: 6,
              }}
            >
              {shareUrl(event.join_code)}
            </div>
            <div style={{ fontSize: 13, color: colors.muted }}>
              Event code:{" "}
              <span style={{ color: colors.text, fontWeight: 700, letterSpacing: "0.08em" }}>
                {event.join_code}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void copy(shareUrl(event.join_code))}
              style={{ ...buttonStyle, marginTop: 14 }}
            >
              {copied ? "Copied ✓" : "Copy link"}
            </button>
          </Card>

          <RoundsSection eventId={event.id} editable={event.status === "draft"} />

          <TeamsRosterSection event={event} editable={event.status === "draft"} />

          <Card>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Next up</div>
            <p style={{ color: colors.muted, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
              The join link for players and match pairings are coming next. Your event is a
              draft — everything stays editable until the first round starts.
            </p>
          </Card>
          </div>
        </>
      )}
    </Page>
  );
}
