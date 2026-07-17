import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { FORMAT_REGISTRY } from "../scoring/formats";
import type { Format } from "../types";
import { TrophyIcon, FlagIcon, GearIcon } from "../components/Icons";
import {
  ensureSession,
  currentUserId,
  getEventById,
  listTeams,
  listEventPlayers,
  listEventRounds,
  listCourses,
  listRoundPlayers,
  listScores,
  startRound,
  finishRound,
  type RoundWithGame,
} from "./api";
import type { Course, EventPlayer, EventRow, RoundPlayer, Score, Team } from "./types";
import {
  Page,
  Card,
  colors,
  displayStyle,
  serifItalicStyle,
  StatusPill,
  ghostButtonStyle,
  buttonStyle,
} from "./ui";

const POLL_MS = 20_000;

// The tournament app — what a joined player (or the organizer) lives in during
// an event. Mirrors the v1 Red Walleye shell: a header with the event name and
// a fixed bottom tab bar (Leaderboard / Rounds / Teams, active tab = filled
// pill), with the scorecard as a tab-less detail screen. All data is
// RLS-scoped product rows; standings poll while play is on.

type Tab = "board" | "rounds" | "teams";

function formatLabel(id: string): string {
  const plugin = FORMAT_REGISTRY[id as Format];
  return plugin ? plugin.labels.long : id;
}

function TeamsIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="8.2" cy="9" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.4" cy="10.6" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M3.4 18.6c.7-2.7 2.6-4.1 4.8-4.1s4.1 1.4 4.8 4.1M14.6 17.9c.5-1.8 1.9-2.9 3.4-2.9 1.2 0 2.3.6 3 1.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function TournamentPage() {
  const { eventId = "" } = useParams<{ eventId: string }>();
  const { pathname } = useLocation();
  const tab: Tab = pathname.endsWith("/rounds")
    ? "rounds"
    : pathname.endsWith("/teams")
      ? "teams"
      : "board";

  const [event, setEvent] = useState<EventRow | null | undefined>(undefined);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<EventPlayer[]>([]);
  const [rounds, setRounds] = useState<RoundWithGame[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [roundPlayers, setRoundPlayers] = useState<RoundPlayer[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshLive = useCallback(async () => {
    const r = await listEventRounds(eventId);
    const started = r.filter((x) => x.round.status !== "pending").map((x) => x.round.id);
    const [rp, s] = await Promise.all([listRoundPlayers(started), listScores(started)]);
    setRounds(r);
    setRoundPlayers(rp);
    setScores(s);
  }, [eventId]);

  useEffect(() => {
    let active = true;
    (async () => {
      await ensureSession();
      const [ev, me] = await Promise.all([getEventById(eventId), currentUserId()]);
      if (!active) return;
      setEvent(ev);
      setUid(me);
      if (!ev) return;
      const [t, p, c] = await Promise.all([
        listTeams(eventId),
        listEventPlayers(eventId),
        listCourses(),
      ]);
      if (!active) return;
      setTeams(t);
      setPlayers(p);
      setCourses(c);
      await refreshLive();
    })().catch((err) => active && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      active = false;
    };
  }, [eventId, refreshLive]);

  // Live-ish standings while play is on: poll + refresh on focus.
  useEffect(() => {
    const t = window.setInterval(() => void refreshLive().catch(() => {}), POLL_MS);
    const onFocus = () => void refreshLive().catch(() => {});
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshLive]);

  if (error && event === undefined) {
    return (
      <Page center>
        <Card>
          <h1 style={{ ...displayStyle, fontSize: 20, margin: "0 0 8px" }}>Something went wrong</h1>
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
          <h1 style={{ ...displayStyle, fontSize: 20, margin: "0 0 8px" }}>No access to this event</h1>
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

  // Gross leaderboard across started rounds: round_player → event_player, then
  // sum strokes. (Net + team points arrive with tees and pairings.)
  const rpToEventPlayer = new Map(roundPlayers.map((rp) => [rp.id, rp.event_player_id]));
  const totals = new Map<string, { total: number; holes: number }>();
  for (const s of scores) {
    if (s.strokes == null) continue;
    const epId = rpToEventPlayer.get(s.round_player_id);
    if (!epId) continue;
    const t = totals.get(epId) ?? { total: 0, holes: 0 };
    t.total += s.strokes;
    t.holes += 1;
    totals.set(epId, t);
  }
  const board = activePlayers
    .map((p) => ({ player: p, ...(totals.get(p.id) ?? { total: 0, holes: 0 }) }))
    .filter((r) => r.holes > 0)
    .sort((a, b) => b.holes - a.holes || a.total - b.total || a.player.name.localeCompare(b.player.name));
  const anyStarted = rounds.some(({ round }) => round.status !== "pending");

  const lifecycle = async (roundId: string, action: "start" | "finish", label: string) => {
    if (busy) return;
    const message =
      action === "start"
        ? `Start ${label}? The roster is enrolled and event setup locks once the first round starts.`
        : `Finish ${label}? Scores lock when a round is final.`;
    if (!window.confirm(message)) return;
    setBusy(true);
    setError(null);
    try {
      if (action === "start") await startRound(roundId, event.id);
      else await finishRound(roundId);
      const [ev] = await Promise.all([getEventById(event.id), refreshLive()]);
      if (ev) setEvent(ev);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

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

  const boardTab = (
    <>
      {!anyStarted ? (
        <Card>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Leaderboard</div>
          <p style={{ color: colors.muted, fontSize: 14, lineHeight: 1.6, margin: "8px 0 0" }}>
            Standings appear here the moment the first round starts.
          </p>
          <p style={{ ...serifItalicStyle, color: colors.muted, fontSize: 12.5, margin: "6px 0 0" }}>
            {activePlayers.length} players · {rounds.length} rounds
          </p>
        </Card>
      ) : (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Leaderboard</div>
            <span style={{ ...serifItalicStyle, color: colors.muted, fontSize: 12.5 }}>
              gross · updates live
            </span>
          </div>
          {board.length === 0 ? (
            <p style={{ color: colors.muted, fontSize: 14, margin: "8px 0 0" }}>No scores in yet.</p>
          ) : (
            <div style={{ marginTop: 8 }}>
              {board.map((row, i) => (
                <div
                  key={row.player.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    padding: "8px 0",
                    borderTop: `1px solid ${colors.border}`,
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: row.player.id === mine?.id ? 700 : 400 }}>
                    <span style={{ ...displayStyle, color: colors.muted, display: "inline-block", width: 28, fontSize: 13 }}>
                      {i + 1}
                    </span>
                    {row.player.name}
                    {row.player.id === mine?.id && <span style={{ color: colors.accent }}> · you</span>}
                  </span>
                  <span style={{ ...serifItalicStyle, color: colors.muted, fontSize: 12.5 }}>
                    <strong style={{ ...displayStyle, color: colors.text, fontSize: 17, fontStyle: "normal" }}>
                      {row.total}
                    </strong>{" "}
                    thru {row.holes}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </>
  );

  const roundsTab = (
    <>
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
              gap: 8,
              padding: "12px 0",
              borderTop: `1px solid ${colors.border}`,
              marginTop: i === 0 ? 10 : 0,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                Round {i + 1}
                {game ? ` · ${formatLabel(game.type)}` : ""}
              </div>
              <div style={{ ...serifItalicStyle, color: colors.muted, fontSize: 12.5, marginTop: 1 }}>
                {round.course_id
                  ? (courseNameById.get(round.course_id) ?? "course TBD")
                  : "course TBD"}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {isOrganizer && round.status === "pending" && game && round.course_id && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void lifecycle(round.id, "start", `Round ${i + 1}`)}
                  style={{ ...buttonStyle, padding: "8px 14px", fontSize: 11 }}
                >
                  Start round
                </button>
              )}
              {round.status !== "pending" && (
                <Link to={`/e/${eventId}/r/${round.id}`} style={{ textDecoration: "none" }}>
                  <button type="button" style={{ ...ghostButtonStyle, fontSize: 11 }}>
                    {round.status === "active" ? "Enter scores →" : "Scorecard →"}
                  </button>
                </Link>
              )}
              {isOrganizer && round.status === "active" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void lifecycle(round.id, "finish", `Round ${i + 1}`)}
                  style={{ ...ghostButtonStyle, fontSize: 11, color: colors.good }}
                >
                  Finish
                </button>
              )}
              <StatusPill status={round.status} />
            </div>
          </div>
        ))}
      </Card>
      {!anyStarted && (
        <p style={{ ...serifItalicStyle, color: colors.muted, fontSize: 12.5, textAlign: "center", margin: "10px 0 0" }}>
          scores open when a round starts
        </p>
      )}
    </>
  );

  const teamsTab = (
    <>
      {teams.map((team) => {
        const roster = activePlayers.filter((p) => p.team_id === team.id);
        return (
          <Card key={team.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ ...displayStyle, fontSize: 16 }}>{team.name}</div>
              <span style={{ ...serifItalicStyle, color: colors.muted, fontSize: 12.5 }}>
                {roster.length} players
              </span>
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
            <span style={{ color: colors.muted, fontWeight: 400, fontSize: 13 }}> · {unassigned.length}</span>
          </div>
          <div style={{ marginTop: 8 }}>{unassigned.map(renderPlayer)}</div>
        </Card>
      )}
    </>
  );

  const tabs: { id: Tab; label: string; to: string; icon: JSX.Element }[] = [
    { id: "board", label: "Leaderboard", to: `/e/${eventId}`, icon: <TrophyIcon /> },
    { id: "rounds", label: "Rounds", to: `/e/${eventId}/rounds`, icon: <FlagIcon /> },
    { id: "teams", label: "Teams", to: `/e/${eventId}/teams`, icon: <TeamsIcon /> },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: colors.bg,
        color: colors.text,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "16px 16px 10px",
          maxWidth: 520,
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1
            style={{
              ...displayStyle,
              fontSize: 20,
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {event.name}
          </h1>
        </div>
        <StatusPill status={event.status} />
        {isOrganizer && (
          <Link
            to={`/app/event/${event.id}`}
            aria-label="Manage event"
            style={{ color: colors.accent, display: "inline-flex", padding: 4 }}
          >
            <GearIcon size={20} />
          </Link>
        )}
      </header>

      {/* Tab content */}
      <main
        style={{
          maxWidth: 520,
          margin: "0 auto",
          padding: "4px 16px 96px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {tab === "board" && boardTab}
        {tab === "rounds" && roundsTab}
        {tab === "teams" && teamsTab}
        {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}
      </main>

      {/* Bottom tab bar — v1 style: fixed, cream card, active = filled pill */}
      <nav
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 30,
          display: "flex",
          background: colors.surface,
          borderTop: `1px solid ${colors.border}`,
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <Link
              key={t.id}
              to={t.to}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "11px 2px 9px",
                minWidth: 0,
                color: active ? colors.surface : colors.muted,
                textDecoration: "none",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: active ? colors.accent : "transparent",
                  border: `1.5px solid ${active ? colors.accent : "transparent"}`,
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ display: "inline-flex" }}>{t.icon}</span>
                {t.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
