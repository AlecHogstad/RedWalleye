import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Hole, Player, TournamentState } from "../types";
import { contextForRound, type ScoringContext } from "../scoring/engine";
import { seedState, STATE_VERSION } from "../data/seed";
import {
  applyRemote,
  remoteWrite,
  subscribeConnected,
  subscribeRemote,
  syncEnabled,
  type RemoteData,
} from "../sync/sync";

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
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  // Local-only mode keeps the whole state; synced mode keeps the remote
  // delta and derives state = seed + delta so every phone agrees.
  const [localState, setLocalState] = useState<TournamentState>(loadLocalState);
  const [remote, setRemote] = useState<RemoteData | null>(loadRemoteCache);
  const [connected, setConnected] = useState(false);

  const state = useMemo(
    () => (syncEnabled ? applyRemote(seedState(), remote) : localState),
    [remote, localState],
  );

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
    setLocalState(seedState());
  }, []);

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
