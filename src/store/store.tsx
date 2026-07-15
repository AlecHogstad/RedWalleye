import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  ActivityEvent,
  DraftState,
  Hole,
  HouseRules,
  MatchSideGames,
  Player,
  Rules,
  TournamentState,
} from "../types";
import { contextForRound, teamScoreKey, type ScoringContext } from "../scoring/engine";
import { reconcileRoster } from "./roster";
import {
  currentPickTeam,
  PICKS_TOTAL,
  reconcileDraftTeams,
  type DraftTeam,
} from "./draft";
import { seedState, STATE_VERSION } from "../data/seed";
import {
  applyRemote,
  remoteWrite,
  resyncFromServer,
  subscribeConnected,
  subscribeRemote,
  syncEnabled,
  type RemoteData,
} from "../sync/sync";
import {
  clearLocalMedia,
  deleteMedia,
  mediaPathForEvent,
  mulliganStampText,
  queueMediaUpload,
  storeLocalMedia,
  compressPhoto,
} from "../sync/media";

const STORAGE_KEY = "red-walleye-state-v1";
const REMOTE_CACHE_KEY = "red-walleye-remote-v1";

// --- Local-only mode persistence ---------------------------------------------

function loadLocalState(): TournamentState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as TournamentState;
    if (parsed.version !== STATE_VERSION) return seedState();
    return parsed;
  } catch {
    return seedState();
  }
}

// --- Synced mode: cache the remote delta for offline cold starts -------------

function loadRemoteCache(): RemoteData | null {
  try {
    const raw = localStorage.getItem(REMOTE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version: number; data: RemoteData };
    return parsed.version === STATE_VERSION ? parsed.data : null;
  } catch {
    return null;
  }
}

export type SyncStatus = "local" | "online" | "offline";

interface StoreValue {
  state: TournamentState;
  syncStatus: SyncStatus;
  setScore: (matchId: string, scoreKey: string, hole: number, value: number | null) => void;
  updatePlayer: (playerId: string, patch: Partial<Pick<Player, "name" | "handicap">>) => void;
  updateHole: (
    courseId: string,
    holeNumber: number,
    patch: Partial<Pick<Hole, "par" | "strokeIndex">>,
  ) => void;
  startRound: (roundId: string, courseId: string, teeName: string) => void;
  finishRound: (roundId: string) => void;
  reopenRound: (roundId: string) => void;
  resetAll: () => void;
  resyncDevice: () => void;
  /** True while every round is still pending — the only time the roster
   *  (team names aside) can be safely restructured. */
  rostersEditable: boolean;
  updateTeam: (teamId: string, patch: { name?: string }) => void;
  addPlayer: (input: { name: string; handicap: number }) => void;
  removePlayer: (playerId: string) => void;
  setTeamRoster: (teamId: string, playerIds: string[]) => void;
  /** Set the players in one match's two sides (the matchup builder). Only the
   *  playerIds change; each side keeps its team. Pending rounds only. */
  setMatchup: (matchId: string, sideAIds: string[], sideBIds: string[]) => void;
  /** Draft: pick captains + first pick, then snake-draft the rest. Pre-round
   *  only. Starting a draft re-pools every non-captain and clears matchups. */
  startDraft: (captainAId: string, captainBId: string, firstPick: DraftTeam) => void;
  draftPick: (playerId: string) => void;
  undoLastPick: () => void;
  resetDraft: () => void;
  updateSideGames: (matchId: string, patch: Partial<MatchSideGames>) => void;
  /** True while every round is still pending — House Rules lock at first tee-off. */
  houseRulesEditable: boolean;
  /** Merge a patch into one format's House Rules (pre-tournament only). */
  setFormatRules: (formatId: string, patch: Rules) => void;
  /** Clear every House Rule override back to the shipped defaults. */
  resetHouseRules: () => void;
  addMulligan: (matchId: string, playerId: string, hole?: number) => string;
  removeMulligan: (matchId: string, playerId: string) => void;
  attachMulliganPhoto: (eventId: string, file: File) => Promise<void>;
}

/** Stable id with a prefix (players, activity events, ...). */
function genId(prefix: string): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (c?.randomUUID) return `${prefix}_${c.randomUUID().slice(0, 8)}`;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Does a player have any score entered in any match? */
function playerHasScores(state: TournamentState, playerId: string): boolean {
  return state.matches.some((m) =>
    Object.values(m.scores[playerId] ?? {}).some((v) => v != null),
  );
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  // Local-only mode keeps the whole state; synced mode keeps the remote
  // delta and derives state = seed + delta so every phone agrees.
  const [localState, setLocalState] = useState<TournamentState>(loadLocalState);
  const [remote, setRemote] = useState<RemoteData | null>(loadRemoteCache);
  const [connected, setConnected] = useState(false);

  const state = useMemo(() => {
    const merged = syncEnabled ? applyRemote(seedState(), remote) : structuredClone(localState);
    reconcileDraftTeams(merged);
    return merged;
  }, [remote, localState]);

  // Persist whichever mode we're in so a refresh never loses the card.
  useEffect(() => {
    try {
      if (syncEnabled) {
        localStorage.setItem(
          REMOTE_CACHE_KEY,
          JSON.stringify({ version: STATE_VERSION, data: remote ?? {} }),
        );
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(localState));
      }
    } catch {
      // storage full / private mode — keep going in memory.
    }
  }, [localState, remote]);

  // Live subscription: every phone's writes land here, including our own
  // (the SDK echoes local writes immediately, even while offline).
  useEffect(() => {
    if (!syncEnabled) return;
    const offData = subscribeRemote(setRemote);
    const offConn = subscribeConnected(setConnected);
    return () => {
      offData();
      offConn();
    };
  }, []);

  // Local-only mode: keep multiple open tabs on the same device in sync.
  useEffect(() => {
    if (syncEnabled) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setLocalState(JSON.parse(e.newValue));
        } catch {
          /* ignore malformed */
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setScore = useCallback(
    (matchId: string, scoreKey: string, hole: number, value: number | null) => {
      if (syncEnabled) {
        remoteWrite.score(matchId, scoreKey, hole, value);
        return;
      }
      setLocalState((prev) => ({
        ...prev,
        matches: prev.matches.map((m) => {
          if (m.id !== matchId) return m;
          const forKey = { ...(m.scores[scoreKey] ?? {}) };
          if (value == null) delete forKey[hole];
          else forKey[hole] = value;
          return { ...m, scores: { ...m.scores, [scoreKey]: forKey } };
        }),
      }));
    },
    [],
  );

  const updatePlayer = useCallback(
    (playerId: string, patch: Partial<Pick<Player, "name" | "handicap">>) => {
      if (syncEnabled) {
        remoteWrite.player(playerId, patch);
        return;
      }
      setLocalState((prev) => ({
        ...prev,
        players: prev.players.map((p) => (p.id === playerId ? { ...p, ...patch } : p)),
      }));
    },
    [],
  );

  const updateHole = useCallback(
    (
      courseId: string,
      holeNumber: number,
      patch: Partial<Pick<Hole, "par" | "strokeIndex">>,
    ) => {
      if (syncEnabled) {
        remoteWrite.hole(courseId, holeNumber, patch);
        return;
      }
      setLocalState((prev) => ({
        ...prev,
        courses: prev.courses.map((c) =>
          c.id === courseId
            ? {
                ...c,
                holes: c.holes.map((h) =>
                  h.number === holeNumber ? { ...h, ...patch } : h,
                ),
              }
            : c,
        ),
      }));
    },
    [],
  );

  // Starting a round locks the others: only allowed when nothing is active.
  // In synced mode the check runs against the merged state, and the write
  // flips status for every phone at once.
  const startRound = useCallback(
    (roundId: string, courseId: string, teeName: string) => {
      if (syncEnabled) {
        if (state.rounds.some((r) => r.status === "active")) return;
        remoteWrite.round(roundId, { status: "active", courseId, teeName });
        return;
      }
      setLocalState((prev) => {
        if (prev.rounds.some((r) => r.status === "active")) return prev;
        return {
          ...prev,
          rounds: prev.rounds.map((r) =>
            r.id === roundId && r.status === "pending"
              ? { ...r, status: "active" as const, courseId, teeName }
              : r,
          ),
        };
      });
    },
    [state.rounds],
  );

  const finishRound = useCallback((roundId: string) => {
    if (syncEnabled) {
      remoteWrite.round(roundId, { status: "final" });
      return;
    }
    setLocalState((prev) => ({
      ...prev,
      rounds: prev.rounds.map((r) =>
        r.id === roundId && r.status === "active"
          ? { ...r, status: "final" as const }
          : r,
      ),
    }));
  }, []);

  // Undo hatch: reopen a finished round (only when nothing else is active).
  const reopenRound = useCallback(
    (roundId: string) => {
      if (syncEnabled) {
        if (state.rounds.some((r) => r.status === "active")) return;
        remoteWrite.round(roundId, { status: "active" });
        return;
      }
      setLocalState((prev) => {
        if (prev.rounds.some((r) => r.status === "active")) return prev;
        return {
          ...prev,
          rounds: prev.rounds.map((r) =>
            r.id === roundId && r.status === "final"
              ? { ...r, status: "active" as const }
              : r,
          ),
        };
      });
    },
    [state.rounds],
  );

  const resetAll = useCallback(() => {
    if (syncEnabled) {
      remoteWrite.resetAll();
      return;
    }
    clearLocalMedia();
    setLocalState(seedState());
  }, []);

  // Fix a device stuck on an old snapshot: drop its local sync state and
  // re-pull from the server. Doesn't touch the shared table (safe mid-round).
  const resyncDevice = useCallback(() => {
    if (syncEnabled) resyncFromServer();
  }, []);

  const rostersEditable = state.rounds.every((r) => r.status === "pending");

  const updateTeam = useCallback(
    (teamId: string, patch: { name?: string }) => {
      if (syncEnabled) {
        remoteWrite.team(teamId, patch);
        return;
      }
      setLocalState((prev) => ({
        ...prev,
        teams: prev.teams.map((t) => (t.id === teamId ? { ...t, ...patch } : t)),
      }));
    },
    [],
  );

  const addPlayer = useCallback((input: { name: string; handicap: number }) => {
    const player: Player = {
      id: genId("p"),
      name: input.name,
      handicap: input.handicap,
      teamId: "",
    };
    if (syncEnabled) {
      remoteWrite.addPlayer(player);
      return;
    }
    setLocalState((prev) => ({ ...prev, players: [...prev.players, player] }));
  }, []);

  const removePlayer = useCallback(
    (playerId: string) => {
      // Only safe pre-round, for a player off every team, with no scores.
      if (!rostersEditable) return;
      const player = state.players.find((p) => p.id === playerId);
      if (!player || player.teamId !== "") return;
      if (playerHasScores(state, playerId)) return;
      if (syncEnabled) {
        remoteWrite.removePlayer(playerId);
        return;
      }
      setLocalState((prev) => ({
        ...prev,
        players: prev.players.filter((p) => p.id !== playerId),
      }));
    },
    [rostersEditable, state],
  );

  const setTeamRoster = useCallback(
    (teamId: string, playerIds: string[]) => {
      if (!rostersEditable) return;
      const unique = Array.from(new Set(playerIds)).filter(Boolean);
      if (unique.length > 4) return;
      const { next, matchPatches, playerTeamChanges } = reconcileRoster(
        state,
        teamId,
        unique,
      );
      if (syncEnabled) {
        for (const patch of matchPatches) {
          remoteWrite.match(patch.id, { sideA: patch.sideA, sideB: patch.sideB });
        }
        for (const change of playerTeamChanges) {
          remoteWrite.player(change.id, { teamId: change.teamId });
        }
        return;
      }
      setLocalState(next);
    },
    [rostersEditable, state],
  );

  const setMatchup = useCallback(
    (matchId: string, sideAIds: string[], sideBIds: string[]) => {
      const match = state.matches.find((m) => m.id === matchId);
      if (!match) return;
      // A round's matchups are editable right up until that round starts —
      // independent of the other rounds' status.
      const round = state.rounds.find((r) => r.id === match.roundId);
      if (!round || round.status !== "pending") return;
      const a = Array.from(new Set(sideAIds)).filter(Boolean);
      const b = Array.from(new Set(sideBIds)).filter(Boolean);
      const sideA = { ...match.sideA, playerIds: a };
      const sideB = { ...match.sideB, playerIds: b };
      if (syncEnabled) {
        // Sides are patched remotely; scores are separate rows and matchups
        // are set pre-round, so there's nothing to migrate.
        remoteWrite.match(matchId, { sideA, sideB });
        return;
      }
      // Local mode: realign the score buckets to the new players (keeping any
      // that were already there — harmless pre-round, tidy if reopened).
      const keys =
        match.format === "scramble"
          ? [teamScoreKey(sideA.teamId), teamScoreKey(sideB.teamId)]
          : [...a, ...b];
      const scores = Object.fromEntries(keys.map((k) => [k, match.scores[k] ?? {}]));
      setLocalState((prev) => ({
        ...prev,
        matches: prev.matches.map((m) =>
          m.id === matchId ? { ...m, sideA, sideB, scores } : m,
        ),
      }));
    },
    [state],
  );

  // --- Draft ----------------------------------------------------------------

  /** Empty scores for a match whose sides were just cleared. */
  const emptyScoresForCleared = (match: (typeof state.matches)[number]) =>
    match.format === "scramble"
      ? {
          [teamScoreKey(match.sideA.teamId)]: {},
          [teamScoreKey(match.sideB.teamId)]: {},
        }
      : {};

  const startDraft = useCallback(
    (captainAId: string, captainBId: string, firstPick: DraftTeam) => {
      if (!rostersEditable) return;
      if (!captainAId || !captainBId || captainAId === captainBId) return;
      const draft: DraftState = {
        status: "active",
        captainA: captainAId,
        captainB: captainBId,
        firstPick,
        picks: [],
        rev: 0,
      };
      // Captains go to their team; everyone else back to the pool.
      const teamFor = (id: string) =>
        id === captainAId ? "tA" : id === captainBId ? "tB" : "";
      if (syncEnabled) {
        remoteWrite.draft(draft);
        for (const p of state.players) {
          const t = teamFor(p.id);
          if (p.teamId !== t) remoteWrite.player(p.id, { teamId: t });
        }
        for (const m of state.matches) {
          remoteWrite.match(m.id, {
            sideA: { ...m.sideA, playerIds: [] },
            sideB: { ...m.sideB, playerIds: [] },
          });
        }
        return;
      }
      setLocalState((prev) => ({
        ...prev,
        draft,
        players: prev.players.map((p) => ({ ...p, teamId: teamFor(p.id) })),
        matches: prev.matches.map((m) => ({
          ...m,
          sideA: { ...m.sideA, playerIds: [] },
          sideB: { ...m.sideB, playerIds: [] },
          scores: emptyScoresForCleared(m),
        })),
      }));
    },
    [rostersEditable, state],
  );

  const draftPick = useCallback(
    (playerId: string) => {
      if (!rostersEditable) return;
      if (syncEnabled) {
        const draft = state.draft;
        if (!draft || draft.status !== "active" || !draft.firstPick) return;
        const player = state.players.find((p) => p.id === playerId);
        if (!player || player.teamId !== "") return;
        const team = currentPickTeam(draft.picks, draft.firstPick);
        if (!team) return;
        const picks = [...draft.picks, playerId];
        const next: DraftState = {
          ...draft,
          picks,
          status: picks.length >= PICKS_TOTAL ? "done" : "active",
          rev: (draft.rev ?? 0) + 1,
        };
        remoteWrite.draftPick(next, playerId, team);
        return;
      }
      setLocalState((prev) => {
        const draft = prev.draft;
        if (!draft || draft.status !== "active" || !draft.firstPick) return prev;
        const player = prev.players.find((p) => p.id === playerId);
        if (!player || player.teamId !== "") return prev;
        const team = currentPickTeam(draft.picks, draft.firstPick);
        if (!team) return prev;
        const picks = [...draft.picks, playerId];
        return {
          ...prev,
          draft: {
            ...draft,
            picks,
            status: picks.length >= PICKS_TOTAL ? "done" : "active",
            rev: (draft.rev ?? 0) + 1,
          },
          players: prev.players.map((p) =>
            p.id === playerId ? { ...p, teamId: team } : p,
          ),
        };
      });
    },
    [rostersEditable, state],
  );

  const undoLastPick = useCallback(() => {
    if (!rostersEditable) return;
    if (syncEnabled) {
      const draft = state.draft;
      if (!draft || draft.picks.length === 0) return;
      const last = draft.picks[draft.picks.length - 1];
      const next: DraftState = {
        ...draft,
        picks: draft.picks.slice(0, -1),
        status: "active",
        rev: (draft.rev ?? 0) + 1,
      };
      remoteWrite.undoDraftPick(next, last);
      return;
    }
    setLocalState((prev) => {
      const draft = prev.draft;
      if (!draft || draft.picks.length === 0) return prev;
      const last = draft.picks[draft.picks.length - 1];
      return {
        ...prev,
        draft: {
          ...draft,
          picks: draft.picks.slice(0, -1),
          status: "active",
          rev: (draft.rev ?? 0) + 1,
        },
        players: prev.players.map((p) => (p.id === last ? { ...p, teamId: "" } : p)),
      };
    });
  }, [rostersEditable, state]);

  const resetDraft = useCallback(() => {
    if (!rostersEditable) return;
    const draft = state.draft;
    if (!draft) return;
    const next: DraftState = {
      ...draft,
      status: "setup",
      picks: [],
      rev: (draft.rev ?? 0) + 1,
    };
    const teamFor = (id: string) =>
      id === draft.captainA ? "tA" : id === draft.captainB ? "tB" : "";
    if (syncEnabled) {
      remoteWrite.draft(next);
      for (const p of state.players) {
        const t = teamFor(p.id);
        if (p.teamId !== t) remoteWrite.player(p.id, { teamId: t });
      }
      return;
    }
    setLocalState((prev) => ({
      ...prev,
      draft: next,
      players: prev.players.map((p) => ({ ...p, teamId: teamFor(p.id) })),
    }));
  }, [rostersEditable, state]);

  const updateSideGames = useCallback(
    (matchId: string, patch: Partial<MatchSideGames>) => {
      if (syncEnabled) {
        remoteWrite.sideGames(matchId, patch);
        return;
      }
      setLocalState((prev) => ({
        ...prev,
        sideGames: {
          ...prev.sideGames,
          [matchId]: { ...(prev.sideGames[matchId] ?? {}), ...patch },
        },
      }));
    },
    [],
  );

  const houseRulesEditable = state.rounds.every((r) => r.status === "pending");

  const setFormatRules = useCallback(
    (formatId: string, patch: Rules) => {
      if (!houseRulesEditable) return;
      const current: HouseRules = state.houseRules ?? { formats: {} };
      const next: HouseRules = {
        ...current,
        formats: {
          ...current.formats,
          [formatId]: { ...(current.formats?.[formatId] ?? {}), ...patch },
        },
      };
      if (syncEnabled) {
        remoteWrite.houseRules(next);
        return;
      }
      setLocalState((prev) => ({ ...prev, houseRules: next }));
    },
    [houseRulesEditable, state],
  );

  const resetHouseRules = useCallback(() => {
    if (!houseRulesEditable) return;
    const empty: HouseRules = { formats: {} };
    if (syncEnabled) {
      remoteWrite.houseRules(empty);
      return;
    }
    setLocalState((prev) => ({ ...prev, houseRules: empty }));
  }, [houseRulesEditable]);

  const addMulligan = useCallback((matchId: string, playerId: string, hole?: number): string => {
    const event: ActivityEvent = {
      id: genId("a"),
      type: "mulligan",
      matchId,
      playerId,
      ts: Date.now(),
      ...(hole != null ? { hole } : {}),
    };
    if (syncEnabled) {
      remoteWrite.addActivity(event);
      return event.id;
    }
    setLocalState((prev) => ({ ...prev, activity: [...prev.activity, event] }));
    return event.id;
  }, []);

  const removeMulligan = useCallback(
    (matchId: string, playerId: string) => {
      // Drop this player's most recent mulligan in this match.
      const latest = [...state.activity]
        .filter(
          (e) =>
            e.type === "mulligan" &&
            e.matchId === matchId &&
            e.playerId === playerId,
        )
        .sort((a, b) => b.ts - a.ts)[0];
      if (!latest) return;
      if (latest.media?.path) void deleteMedia(latest.media.path);
      if (syncEnabled) {
        remoteWrite.removeActivity(latest.id);
        return;
      }
      setLocalState((prev) => ({
        ...prev,
        activity: prev.activity.filter((e) => e.id !== latest.id),
      }));
    },
    [state.activity],
  );

  const attachMulliganPhoto = useCallback(
    async (eventId: string, file: File) => {
      const event = state.activity.find((e) => e.id === eventId);
      if (!event || event.type !== "mulligan") return;
      const player = state.players.find((p) => p.id === event.playerId);
      const blob = await compressPhoto(file, mulliganStampText(player?.name, event.hole));
      const path = mediaPathForEvent(eventId);
      const pendingEvent: ActivityEvent = {
        ...event,
        media: { path, mime: "image/jpeg", status: "pending" },
      };
      const readyEvent: ActivityEvent = {
        ...event,
        media: { path, mime: "image/jpeg" },
      };

      if (syncEnabled) {
        remoteWrite.updateActivity(pendingEvent);
        await queueMediaUpload(path, blob, () => {
          remoteWrite.updateActivity(readyEvent);
        });
        return;
      }
      storeLocalMedia(path, blob);
      setLocalState((prev) => ({
        ...prev,
        activity: prev.activity.map((e) => (e.id === eventId ? readyEvent : e)),
      }));
    },
    [state.activity],
  );

  const syncStatus: SyncStatus = !syncEnabled ? "local" : connected ? "online" : "offline";

  const value = useMemo<StoreValue>(
    () => ({
      state,
      syncStatus,
      setScore,
      updatePlayer,
      updateHole,
      startRound,
      finishRound,
      reopenRound,
      resetAll,
      resyncDevice,
      rostersEditable,
      updateTeam,
      addPlayer,
      removePlayer,
      setTeamRoster,
      setMatchup,
      startDraft,
      draftPick,
      undoLastPick,
      resetDraft,
      updateSideGames,
      houseRulesEditable,
      setFormatRules,
      resetHouseRules,
      addMulligan,
      removeMulligan,
      attachMulliganPhoto,
    }),
    [
      state,
      syncStatus,
      setScore,
      updatePlayer,
      updateHole,
      startRound,
      finishRound,
      reopenRound,
      resetAll,
      resyncDevice,
      rostersEditable,
      updateTeam,
      addPlayer,
      removePlayer,
      setTeamRoster,
      setMatchup,
      startDraft,
      draftPick,
      undoLastPick,
      resetDraft,
      updateSideGames,
      houseRulesEditable,
      setFormatRules,
      resetHouseRules,
      addMulligan,
      removeMulligan,
      attachMulliganPhoto,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

// Convenience selectors -----------------------------------------------------

export function usePlayerMap(): Record<string, Player> {
  const { state } = useStore();
  return useMemo(
    () => Object.fromEntries(state.players.map((p) => [p.id, p])),
    [state.players],
  );
}

/** Scoring context (course + tee) for every round, keyed by round id. */
export function useRoundContexts(): Record<string, ScoringContext> {
  const { state } = useStore();
  return useMemo(
    () =>
      Object.fromEntries(
        state.rounds.map((r) => [r.id, contextForRound(state, r.id)]),
      ),
    [state],
  );
}
