import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FORMAT_REGISTRY } from "../scoring/formats";
import type { Format } from "../types";
import {
  ensureSession,
  currentUserId,
  getEventById,
  listTeams,
  listEventPlayers,
  listEventRounds,
  listCourses,
  type RoundWithGame,
} from "./api";
import type { Course, EventPlayer, EventRow, Team } from "./types";
import { Page, Card, colors, StatusPill, ghostButtonStyle } from "./ui";

// The tournament page — what a joined player (or the organizer) sees for an
// event: teams with their rosters, and the round schedule. This is the clean
// rebuild of the Red Walleye experience on the product backend: same concepts,
// but every row comes from Postgres scoped by RLS. Scores + the live
// leaderboard land here next (the engine adapter slice).

function formatLabel(id: string): string {
  const plugin = FORMAT_REGISTRY[id as Format];
  return plugin ? plugin.labels.long : id;
}

export default function TournamentPage() {
  const { eventId = "" } = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<EventRow | null | undefined>(undefined);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<EventPlayer[]>([]);
  const [rounds, setRounds] = useState<RoundWithGame[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      await ensureSession();
      const [ev, me] = await Promise.all([getEventById(eventId), currentUserId()]);
      if (!active) return;
      setEvent(ev);
      setUid(me);
      if (!ev) return;
      const [t, p, r, c] = await Promise.all([
        listTeams(eventId),
        listEventPlayers(eventId),
        listEventRounds(eventId),
        listCourses(),
      ]);
      if (!active) return;
      setTeams(t);
      setPlayers(p);
      setRounds(r);
      setCourses(c);
    })().catch((err) => active && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      active = false;
    };
  }, [eventId]);

  if (error) {
    return (
      <Page center>
        <Card>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ color: colors.danger, fontSize: 14, lineHeight: 1.6 }}>{error}</p>
        </Card>
      </Page>
    );
  }
  if (event === undefined) {
    return (
      <Page center>
        <p style={{ color: colors.muted, textAlign: "center" }}>Loading…</p>
      </Page>
    );
  }
  if (event === null) {
    return (
      <Page center>
        <Card>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>No access to this event</h1>
          <p style={{ color: colors.muted, fontSize: 14, lineHeight: 1.6 }}>
            You're not on this event's roster on this device. Open the invite link the
            organizer shared to join (or rejoin with your PIN).
          </p>
        </Card>
      </Page>
    );
  }

  const activePlayers = players.filter((p) => p.status === "active");
  const mine = activePlayers.find((p) => p.claimed_by != null && p.claimed_by === uid);
  const unassigned = activePlayers.filter((p) => p.team_id == null);
  const courseNameById = new Map(courses.map((c) => [c.id, c.name]));
  const isOrganizer = uid != null && uid === event.organizer_id;

  const renderPlayer = (p: EventPlayer) => (
    <div
      key={p.id}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "8px 0",
        borderTop: `1px solid ${colors.border}`,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: p.id === mine?.id ? 700 : 400 }}>
        {p.name}
        {p.id === mine?.id && <span style={{ color: colors.accent }}> · you</span>}
      </span>
      <span style={{ color: colors.muted, fontSize: 12 }}>
        {p.handicap != null ? `HCP ${p.handicap}` : ""}
      </span>
    </div>
  );

  return (
    <Page>
      <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>Tournament</p>
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "4px 0 16px" }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>{event.name}</h1>
        <StatusPill status={event.status} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {isOrganizer && (
          <Link to={`/app/event/${event.id}`} style={{ textDecoration: "none" }}>
            <button type="button" style={{ ...ghostButtonStyle, width: "100%" }}>
              Manage event →
            </button>
          </Link>
        )}

        {teams.map((team) => {
          const roster = activePlayers.filter((p) => p.team_id === team.id);
          return (
            <Card key={team.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{team.name}</div>
                <span style={{ color: colors.muted, fontSize: 13 }}>{roster.length} players</span>
              </div>
              <div style={{ marginTop: 8 }}>
                {roster.length === 0 ? (
                  <p style={{ color: colors.muted, fontSize: 13, margin: "4px 0 0" }}>
                    Nobody assigned yet.
                  </p>
                ) : (
                  roster.map(renderPlayer)
                )}
              </div>
            </Card>
          );
        })}

        {unassigned.length > 0 && (
          <Card>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              Not on a team yet
              <span style={{ color: colors.muted, fontWeight: 400, fontSize: 13 }}>
                {" "}
                · {unassigned.length}
              </span>
            </div>
            <div style={{ marginTop: 8 }}>{unassigned.map(renderPlayer)}</div>
          </Card>
        )}

        <Card>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Rounds</div>
          {rounds.length === 0 && (
            <p style={{ color: colors.muted, fontSize: 14, margin: "8px 0 0" }}>
              The schedule isn't set yet.
            </p>
          )}
          {rounds.map(({ round, game }, i) => (
            <div
              key={round.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 0",
                borderTop: `1px solid ${colors.border}`,
                marginTop: i === 0 ? 10 : 0,
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  Round {i + 1}
                  {game ? ` · ${formatLabel(game.type)}` : ""}
                </div>
                <div style={{ color: colors.muted, fontSize: 12, marginTop: 1 }}>
                  {round.course_id
                    ? (courseNameById.get(round.course_id) ?? "Course TBD")
                    : "Course TBD"}
                </div>
              </div>
              <StatusPill status={round.status} />
            </div>
          ))}
        </Card>

        <p style={{ color: colors.muted, fontSize: 13, textAlign: "center", margin: "8px 0 0" }}>
          Scores and the live leaderboard show up here once play starts.
        </p>
      </div>
    </Page>
  );
}
