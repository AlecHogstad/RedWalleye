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

const STORAGE_KEY = "red-walleye-state-v1";

function loadState(): TournamentState {
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

interface StoreValue {
  state: TournamentState;
  setScore: (matchId: string, scoreKey: string, hole: number, value: number | null) => void;
  updatePlayer: (playerId: string, patch: Partial<Pick<Player, "name" | "handicap">>) => void;
  updateHole: (
    courseId: string,
    holeNumber: number,
    patch: Partial<Pick<Hole, "par" | "strokeIndex">>,
  ) => void;
  setCourseName: (courseId: string, name: string) => void;
  startRound: (roundId: string, courseId: string, teeName: string) => void;
  finishRound: (roundId: string) => void;
  reopenRound: (roundId: string) => void;
  resetAll: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TournamentState>(loadState);

  // Persist on every change so a phone refresh never loses the card.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage full / private mode — nothing we can do, keep going in memory.
    }
  }, [state]);

  // Keep multiple open tabs / a re-opened link in sync on the same device.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setState(JSON.parse(e.newValue));
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
      setState((prev) => ({
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
      setState((prev) => ({
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
      setState((prev) => ({
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

  const setCourseName = useCallback((courseId: string, name: string) => {
    setState((prev) => ({
      ...prev,
      courses: prev.courses.map((c) => (c.id === courseId ? { ...c, name } : c)),
    }));
  }, []);

  // Starting a round locks the others: only allowed when nothing is active.
  const startRound = useCallback((roundId: string, courseId: string, teeName: string) => {
    setState((prev) => {
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
  }, []);

  const finishRound = useCallback((roundId: string) => {
    setState((prev) => ({
      ...prev,
      rounds: prev.rounds.map((r) =>
        r.id === roundId && r.status === "active"
          ? { ...r, status: "final" as const }
          : r,
      ),
    }));
  }, []);

  // Undo hatch: reopen a finished round (only when nothing else is active).
  const reopenRound = useCallback((roundId: string) => {
    setState((prev) => {
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
  }, []);

  const resetAll = useCallback(() => setState(seedState()), []);

  const value = useMemo<StoreValue>(
    () => ({
      state,
      setScore,
      updatePlayer,
      updateHole,
      setCourseName,
      startRound,
      finishRound,
      reopenRound,
      resetAll,
    }),
    [
      state,
      setScore,
      updatePlayer,
      updateHole,
      setCourseName,
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
