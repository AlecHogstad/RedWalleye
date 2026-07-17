import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, useLocation, useParams } from "react-router-dom";
import { TrophyIcon, FlagIcon, GearIcon } from "../components/Icons";
import { PoleFlag } from "../components/CheckFlag";
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
import RoundCards from "./RoundCards";
import type { Course, EventPlayer, EventRow, Round, RoundPlayer, Score, Team } from "./types";
import { Page, Card, colors, displayStyle } from "./ui";

const POLL_MS = 20_000;

// The tournament app — what a joined player (or the organizer) lives in during
// an event. Mirrors the v1 Red Walleye shell: a header with the event name and
// a fixed bottom tab bar (Leaderboard / Rounds / Teams, active tab = filled
// pill), with the scorecard as a tab-less detail screen. All data is
// RLS-scoped product rows; standings poll while play is on.

type Tab = "board" | "rounds" | "teams";

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

  // v1 `.standing` rows (same classes the HomePage leaderboard uses).
  const renderPlayer = (p: EventPlayer) => (
    <div className="standing" key={p.id} style={{ padding: "10px 16px" }}>
      <span className="dot" style={{ background: "transparent" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="team-name" style={{ fontSize: 14 }}>
          {p.name}
          {p.id === mine?.id && (
            <em style={{ color: "var(--orange)", fontStyle: "normal" }}> · you</em>
          )}
        </div>
      </div>
      <span className="team-meta">{p.handicap != null ? `HCP ${p.handicap}` : ""}</span>
    </div>
  );

  const boardTab = (
    <section className="section">
      <div className="card">
        {!anyStarted ? (
          <p className="hint" style={{ padding: "14px 16px" }}>
            Standings appear the moment the first round starts — {activePlayers.length} players,{" "}
            {rounds.length} rounds.
          </p>
        ) : board.length === 0 ? (
          <p className="hint" style={{ padding: "14px 16px" }}>
            No scores in yet.
          </p>
        ) : (
          board.map((row, i) => (
            <div className="standing" key={row.player.id}>
              <span className="rank">{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="team-name" style={{ fontSize: 15 }}>
                  {row.player.name}
                  {row.player.id === mine?.id && (
                    <em style={{ color: "var(--orange)", fontStyle: "normal" }}> · you</em>
                  )}
                </div>
                <div className="team-meta">thru {row.holes}</div>
              </div>
              <span className="pts">{row.total}</span>
            </div>
          ))
        )}
      </div>
      {anyStarted && <p className="hint">Gross strokes · updates live on every phone.</p>}
    </section>
  );

  const roundsTab = (
    <>
      <RoundCards
        eventId={eventId}
        expectedPlayers={event.expected_players}
        rounds={rounds}
        teams={teams}
        players={activePlayers}
        courses={courses}
        isOrganizer={isOrganizer}
        busy={busy}
        onLifecycle={(roundId, action, label) => void lifecycle(roundId, action, label)}
        onRoundUpdated={(updated: Round) =>
          setRounds((prev) => prev.map((r) => (r.round.id === updated.id ? { ...r, round: updated } : r)))
        }
      />
      {!anyStarted && <p className="hint center">Scores open when a round starts.</p>}
    </>
  );

  const teamColors = ["#de4f2c", "#1e4a2b"];
  const teamsTab = (
    <>
      {teams.map((team, ti) => {
        const roster = activePlayers.filter((p) => p.team_id === team.id);
        return (
          <section className="section" key={team.id} style={ti > 0 ? { paddingTop: 0 } : undefined}>
            <div className="card">
              <div className="standing">
                <span className="dot" style={{ background: team.color ?? teamColors[ti] ?? "#26301f" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="team-name">{team.name}</div>
                  <div className="team-meta">
                    {roster.length === 0 ? "nobody assigned yet" : `${roster.length} players`}
                  </div>
                </div>
              </div>
              {roster.map(renderPlayer)}
            </div>
          </section>
        );
      })}
      {unassigned.length > 0 && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="card">
            <div className="standing">
              <span className="dot" style={{ background: "transparent" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="team-name">Not on a team yet</div>
                <div className="team-meta">{unassigned.length} players</div>
              </div>
            </div>
            {unassigned.map(renderPlayer)}
          </div>
        </section>
      )}
    </>
  );

  // Same shell as v1's App.tsx: .app theme + .topbar (lockup / wordmark) +
  // main + .tabbar — the global index.css does all the styling.
  const initials = event.name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="app theme-green">
      <header className="topbar">
        <div className="lockup" aria-label={event.name}>
          <PoleFlag />
          <span>{initials}</span>
        </div>
        <div className="wordmark">{event.name}</div>
        <span className="spacer" />
        {event.status === "active" ? (
          <span className="sync online">● live</span>
        ) : (
          <span className="est">{event.status}</span>
        )}
        {isOrganizer && (
          <Link to={`/app/event/${event.id}`} className="header-btn" aria-label="Manage event">
            <GearIcon />
          </Link>
        )}
      </header>

      <main>
        {tab === "board" && boardTab}
        {tab === "rounds" && roundsTab}
        {tab === "teams" && teamsTab}
        {error && (
          <p className="hint center" style={{ color: "var(--orange)" }}>
            {error}
          </p>
        )}
      </main>

      <nav className="tabbar">
        <NavLink to={`/e/${eventId}`} end>
          <span className="tab-inner">
            <span className="tab-icon">
              <TrophyIcon />
            </span>
            <span className="tab-label">Leaderboard</span>
          </span>
        </NavLink>
        <NavLink to={`/e/${eventId}/rounds`}>
          <span className="tab-inner">
            <span className="tab-icon">
              <FlagIcon />
            </span>
            <span className="tab-label">Rounds</span>
          </span>
        </NavLink>
        <NavLink to={`/e/${eventId}/teams`}>
          <span className="tab-inner">
            <span className="tab-icon">
              <TeamsIcon />
            </span>
            <span className="tab-label">Teams</span>
          </span>
        </NavLink>
      </nav>
    </div>
  );
}
