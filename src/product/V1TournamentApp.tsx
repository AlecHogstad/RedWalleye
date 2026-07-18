import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  MemoryRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import type {
  CourseDef,
  Match,
  MatchSideGames,
  Player,
  Round as V1Round,
  TournamentState,
} from "../types";
import { StoreContext, type StoreValue } from "../store/store";
import { ConfirmProvider } from "../components/ConfirmDialog";
import { PoleFlag } from "../components/CheckFlag";
import { TrophyIcon, FlagIcon, GearIcon, TickerIcon } from "../components/Icons";
import HomePage from "../pages/HomePage";
import RoundsPage from "../pages/RoundsPage";
import MatchPage from "../pages/MatchPage";
import StartRoundPage from "../pages/StartRoundPage";
import MatchupsPage from "../pages/MatchupsPage";
import TickerPage from "../pages/TickerPage";
import PlayerPage from "../pages/PlayerPage";
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
  listRoundPlayers,
  listScores,
  startRound as apiStartRound,
  finishRound as apiFinishRound,
  reopenRound as apiReopenRound,
  setRoundCourse,
  updateRoundMatches,
  upsertScore,
  type RoundWithGame,
} from "./api";
import type {
  Course as ProductCourse,
  EventPlayer,
  EventRow,
  RoundMatch,
  RoundPlayer,
  Score,
  Team as ProductTeam,
} from "./types";
import { Page, Card, colors, displayStyle } from "./ui";

// ============================================================================
// Tournament Pass → v1 bridge. V1 IS the spec for the player experience: this
// module renders the ACTUAL v1 pages (HomePage, RoundsPage, MatchPage,
// TickerPage, …) unchanged, by assembling their TournamentState from product
// rows and mapping their store actions onto the product API. The v1 pages
// navigate with absolute paths (/match/:id …), so they run inside their own
// MemoryRouter, mounted at /e/:eventId; v1's own back pills handle
// navigation, exactly like the app.
// ============================================================================

const POLL_MS = 15_000;
const TEAM_COLORS = ["#de4f2c", "#1e4a2b"]; // A orange, B green (v1 seed)
const DEFAULT_TEE = { name: "Standard", yardage: 6200, rating: 72.0, slope: 113 };

/** matchId codec: product matches are (roundId, index) pairs. */
const matchId = (roundId: string, idx: number) => `${roundId}~${idx}`;
const parseMatchId = (id: string): { roundId: string; idx: number } => {
  const at = id.lastIndexOf("~");
  return { roundId: id.slice(0, at), idx: Number(id.slice(at + 1)) };
};

function seatsFor(format: string): number {
  const plugin = FORMAT_REGISTRY[format as Format];
  return plugin ? plugin.seatsPerSide : 2;
}

interface ProductData {
  event: EventRow;
  teams: ProductTeam[];
  players: EventPlayer[];
  rounds: RoundWithGame[];
  courses: ProductCourse[];
  roundPlayers: RoundPlayer[];
  scores: Score[];
}

/** Product course → v1 CourseDef. Hole data is synthesized until the full
 *  course picker (O-96) carries real scorecards: par 4s, SI = hole number. */
function toCourseDef(c: ProductCourse): CourseDef {
  return {
    id: c.id,
    name: c.name,
    holes: Array.from({ length: 18 }, (_, i) => ({
      number: i + 1,
      par: 4,
      strokeIndex: i + 1,
    })),
    tees: [DEFAULT_TEE],
  };
}

/** The whole mapping: product rows → the exact TournamentState v1 renders. */
function buildState(d: ProductData): TournamentState {
  const teamIdOf = new Map<string, "tA" | "tB">();
  d.teams.forEach((t, i) => teamIdOf.set(t.id, i === 0 ? "tA" : "tB"));

  const activePlayers = d.players.filter((p) => p.status === "active");
  const players: Player[] = activePlayers.map((p) => ({
    id: p.id,
    name: p.name,
    handicap: p.handicap ?? 0,
    teamId: (p.team_id ? teamIdOf.get(p.team_id) : undefined) ?? "tA",
  }));

  // round_player → event_player (and back), per round, for score mapping.
  const rpToEp = new Map<string, string>();
  const epToRp = new Map<string, string>(); // `${roundId}:${epId}` → rpId
  for (const rp of d.roundPlayers) {
    if (rp.event_player_id) {
      rpToEp.set(rp.id, rp.event_player_id);
      epToRp.set(`${rp.round_id}:${rp.event_player_id}`, rp.id);
    }
  }

  // scores by round_player, then hole.
  const holesByRp = new Map<string, Record<number, number | undefined>>();
  for (const s of d.scores) {
    if (s.strokes == null) continue;
    const h = holesByRp.get(s.round_player_id) ?? {};
    h[s.hole_number] = s.strokes;
    holesByRp.set(s.round_player_id, h);
  }
  const holesOfEp = (roundId: string, epId: string | null) => {
    if (!epId) return {};
    const rpId = epToRp.get(`${roundId}:${epId}`);
    return rpId ? (holesByRp.get(rpId) ?? {}) : {};
  };

  const rounds: V1Round[] = [];
  const matches: Match[] = [];
  const sideGames: Record<string, MatchSideGames> = {};

  d.rounds.forEach(({ round, game }, i) => {
    const format = (game?.type ?? "fourball") as Format;
    rounds.push({
      id: round.id,
      name: `Round ${i + 1}`,
      format,
      status: round.status,
      courseId: round.course_id ?? undefined,
      teeName: round.status !== "pending" && round.course_id ? DEFAULT_TEE.name : undefined,
    });

    const seats = seatsFor(format);
    const stored = round.matches_json ?? [];
    const count =
      stored.length > 0
        ? stored.length
        : Math.max(
            1,
            Math.floor((d.event.expected_players ?? activePlayers.length) / (2 * seats)),
          );

    for (let mi = 0; mi < count; mi += 1) {
      const m: RoundMatch & { sideGames?: MatchSideGames } = stored[mi] ?? {
        sideA: [],
        sideB: [],
      };
      const aIds = (m.sideA ?? []).filter(Boolean) as string[];
      const bIds = (m.sideB ?? []).filter(Boolean) as string[];
      const id = matchId(round.id, mi);

      const scores: Match["scores"] = {};
      if (format === "scramble") {
        // v1 enters the team ball under a synthetic key; the product stores it
        // on the side's first player (the "carrier").
        if (aIds[0]) scores["team:tA"] = holesOfEp(round.id, aIds[0]);
        if (bIds[0]) scores["team:tB"] = holesOfEp(round.id, bIds[0]);
      } else {
        for (const pid of [...aIds, ...bIds]) scores[pid] = holesOfEp(round.id, pid);
      }

      matches.push({
        id,
        roundId: round.id,
        format,
        sideA: { teamId: "tA", playerIds: aIds },
        sideB: { teamId: "tB", playerIds: bIds },
        scores,
      });
      if (m.sideGames) sideGames[id] = m.sideGames;
    }
  });

  return {
    version: 1,
    courses: d.courses.map(toCourseDef),
    // Always exactly two teams — v1 assumes tA/tB exist. Fall back to defaults
    // if the event's team rows haven't been seeded yet.
    teams: [0, 1].map((i) => ({
      id: i === 0 ? "tA" : "tB",
      name: d.teams[i]?.name ?? (i === 0 ? "Team A" : "Team B"),
      color: d.teams[i]?.color ?? TEAM_COLORS[i],
    })),
    players,
    rounds,
    matches,
    sideGames,
    activity: [], // mulligans arrive with the feature toggle; derived feed works
  };
}

// --- The v1 shell (App.tsx's chrome), inside the MemoryRouter ---------------

function themeFor(pathname: string): string {
  if (pathname.startsWith("/match")) return "theme-blue";
  return "theme-green";
}

function V1Shell({ event, isOrganizer }: { event: EventRow; isOrganizer: boolean }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const showTabs =
    !pathname.startsWith("/match") &&
    !pathname.startsWith("/start") &&
    !pathname.startsWith("/matchups") &&
    !pathname.startsWith("/player") &&
    !pathname.startsWith("/ticker");
  const onTicker = pathname.startsWith("/ticker");
  const back = !showTabs
    ? pathname.startsWith("/player/")
      ? { to: "/", label: "← Leaderboard" }
      : pathname.startsWith("/ticker")
        ? null // ticker uses history back below
        : { to: "/rounds", label: "← Rounds" }
    : null;

  const initials = event.name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className={`app ${themeFor(pathname)} ${showTabs ? "" : "no-tabs"}`}>
      <header className="topbar">
        {back ? (
          <Link className="badge topbar-back" to={back.to}>
            {back.label}
          </Link>
        ) : onTicker ? (
          <button type="button" className="badge topbar-back" onClick={() => navigate(-1)}>
            ← Back
          </button>
        ) : (
          <>
            <div className="lockup" aria-label={event.name}>
              <PoleFlag />
              <span>{initials}</span>
            </div>
            <div className="wordmark">{event.name}</div>
          </>
        )}
        <span className="spacer" />
        <span className="sync online">● live</span>
        <Link to="/ticker" className={`header-btn ${onTicker ? "active" : ""}`} aria-label="Activity ticker">
          <TickerIcon />
        </Link>
        {isOrganizer && (
          <a className="header-btn" href={`#/app/event/${event.id}`} aria-label="Manage event">
            <GearIcon />
          </a>
        )}
      </header>

      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/rounds" element={<RoundsPage />} />
          <Route path="/start/:roundId" element={<StartRoundPage />} />
          <Route path="/matchups/:roundId" element={<MatchupsPage />} />
          <Route path="/match/:matchId" element={<MatchPage />} />
          <Route path="/ticker" element={<TickerPage />} />
          <Route path="/player/:playerId" element={<PlayerPage />} />
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
        </nav>
      )}
    </div>
  );
}

// --- The provider: product data in, StoreValue out ---------------------------

export default function V1TournamentApp() {
  const { eventId = "" } = useParams<{ eventId: string }>();
  const [data, setData] = useState<ProductData | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dataRef = useRef<ProductData | null>(null);
  dataRef.current = data;

  const load = useCallback(async () => {
    const ev = await getEventById(eventId);
    if (!ev) {
      setDenied(true);
      return;
    }
    const [teams, players, rounds, courses] = await Promise.all([
      listTeams(eventId),
      listEventPlayers(eventId),
      listEventRounds(eventId),
      listCourses(),
    ]);
    const roundIds = rounds.map((r) => r.round.id);
    const [roundPlayers, scores] = await Promise.all([
      listRoundPlayers(roundIds),
      listScores(roundIds),
    ]);
    setData({ event: ev, teams, players, rounds, courses, roundPlayers, scores });
  }, [eventId]);

  useEffect(() => {
    let active = true;
    (async () => {
      await ensureSession();
      const me = await currentUserId();
      if (!active) return;
      setUid(me);
      await load();
    })().catch((err) => active && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      active = false;
    };
  }, [eventId, load]);

  useEffect(() => {
    const t = window.setInterval(() => void load().catch(() => {}), POLL_MS);
    const onFocus = () => void load().catch(() => {});
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const state = useMemo(() => (data ? buildState(data) : null), [data]);

  // ---- store actions, mapped to the product API ----------------------------

  const warn = (what: string) => () =>
    console.warn(`[tournament-pass] ${what} is managed on the organizer dashboard.`);

  const setScore = useCallback(
    (mid: string, scoreKey: string, hole: number, value: number | null) => {
      const d = dataRef.current;
      if (!d) return;
      const { roundId, idx } = parseMatchId(mid);
      const rw = d.rounds.find((r) => r.round.id === roundId);
      if (!rw) return;
      const stored = rw.round.matches_json?.[idx];
      let epId: string | null | undefined;
      if (scoreKey.startsWith("team:")) {
        const side = scoreKey === "team:tA" ? stored?.sideA : stored?.sideB;
        epId = (side ?? []).find(Boolean);
      } else {
        epId = scoreKey;
      }
      if (!epId) return;
      const rp = d.roundPlayers.find(
        (r) => r.round_id === roundId && r.event_player_id === epId,
      );
      if (!rp) {
        console.warn("[tournament-pass] no enrollment for player in round (round not started?)");
        return;
      }
      // Optimistic local apply, then write; poll reconciles.
      setData((prev) => {
        if (!prev) return prev;
        const rest = prev.scores.filter(
          (s) => !(s.round_player_id === rp.id && s.hole_number === hole),
        );
        return {
          ...prev,
          scores: [
            ...rest,
            {
              id: `tmp-${rp.id}-${hole}`,
              round_id: roundId,
              round_player_id: rp.id,
              hole_number: hole,
              strokes: value,
              pickup_flag: false,
              updated_by: uid,
              updated_at: new Date().toISOString(),
            },
          ],
        };
      });
      void upsertScore({ roundId, roundPlayerId: rp.id, hole, strokes: value }).catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
    },
    [uid],
  );

  const writeMatches = useCallback(
    async (roundId: string, next: (RoundMatch & { sideGames?: MatchSideGames })[]) => {
      setData((prev) =>
        prev
          ? {
              ...prev,
              rounds: prev.rounds.map((r) =>
                r.round.id === roundId
                  ? { ...r, round: { ...r.round, matches_json: next } }
                  : r,
              ),
            }
          : prev,
      );
      try {
        await updateRoundMatches(roundId, next);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        void load().catch(() => {});
      }
    },
    [load],
  );

  const store = useMemo<StoreValue | null>(() => {
    if (!state || !data) return null;
    const allPending = data.rounds.every(({ round }) => round.status === "pending");
    return {
      state,
      syncStatus: "online",
      setScore,
      updatePlayer: warn("player editing"),
      updateHole: warn("hole editing"),
      startRound: (roundId, courseId) => {
        void (async () => {
          await setRoundCourse(roundId, courseId);
          await apiStartRound(roundId, data.event.id);
          await load();
        })().catch((err) => setError(err instanceof Error ? err.message : String(err)));
      },
      finishRound: (roundId) => {
        void apiFinishRound(roundId)
          .then(load)
          .catch((err) => setError(err instanceof Error ? err.message : String(err)));
      },
      reopenRound: (roundId) => {
        void apiReopenRound(roundId)
          .then(load)
          .catch((err) => setError(err instanceof Error ? err.message : String(err)));
      },
      resetAll: warn("reset"),
      resyncDevice: () => void load(),
      rostersEditable: allPending,
      updateTeam: warn("team editing"),
      addPlayer: warn("roster editing"),
      removePlayer: warn("roster editing"),
      setTeamRoster: warn("roster editing"),
      setMatchup: (mid, sideAIds, sideBIds) => {
        const d = dataRef.current;
        if (!d) return;
        const { roundId, idx } = parseMatchId(mid);
        const rw = d.rounds.find((r) => r.round.id === roundId);
        if (!rw) return;
        const format = (rw.game?.type ?? "fourball") as Format;
        const seats = seatsFor(format);
        const base: (RoundMatch & { sideGames?: MatchSideGames })[] =
          rw.round.matches_json && rw.round.matches_json.length > 0
            ? rw.round.matches_json.map((m) => ({ ...m }))
            : state.matches
                .filter((m) => m.roundId === roundId)
                .map(() => ({ sideA: [], sideB: [] }));
        const pad = (ids: string[]) =>
          Array.from({ length: seats }, (_, i) => ids[i] ?? null);
        base[idx] = { ...base[idx], sideA: pad(sideAIds), sideB: pad(sideBIds) };
        void writeMatches(roundId, base);
      },
      startDraft: warn("the draft"),
      draftPick: warn("the draft"),
      undoLastPick: warn("the draft"),
      resetDraft: warn("the draft"),
      updateSideGames: (mid, patch) => {
        const d = dataRef.current;
        if (!d) return;
        const { roundId, idx } = parseMatchId(mid);
        const rw = d.rounds.find((r) => r.round.id === roundId);
        if (!rw) return;
        const base: (RoundMatch & { sideGames?: MatchSideGames })[] = (
          rw.round.matches_json ?? []
        ).map((m) => ({ ...m }));
        if (!base[idx]) return;
        base[idx] = {
          ...base[idx],
          sideGames: { ...(base[idx].sideGames ?? {}), ...patch },
        };
        void writeMatches(roundId, base);
      },
      houseRulesEditable: allPending,
      setFormatRules: warn("house rules"),
      setSideGameRules: warn("house rules"),
      resetHouseRules: warn("house rules"),
      addMulligan: () => {
        warn("mulligans (enable them in event settings — coming soon)")();
        return "";
      },
      removeMulligan: warn("mulligans"),
      attachMulliganPhoto: async () => warn("mulligan photos")(),
    };
  }, [state, data, setScore, writeMatches, load]);

  // ---- render ---------------------------------------------------------------

  if (error && !data) {
    return (
      <Page center>
        <Card>
          <h1 style={{ ...displayStyle, fontSize: 20, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ color: colors.danger, fontSize: 14, lineHeight: 1.6 }}>{error}</p>
        </Card>
      </Page>
    );
  }
  if (denied) {
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
  if (!store || !data) {
    return (
      <Page center>
        <p style={{ color: colors.muted, textAlign: "center" }}>Loading…</p>
      </Page>
    );
  }

  const isOrganizer = uid != null && uid === data.event.organizer_id;

  return (
    <StoreContext.Provider value={store}>
      <ConfirmProvider>
        <MemoryRouter>
          <V1Shell event={data.event} isOrganizer={isOrganizer} />
        </MemoryRouter>
      </ConfirmProvider>
    </StoreContext.Provider>
  );
}
