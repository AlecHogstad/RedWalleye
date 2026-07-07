// ---------------------------------------------------------------------------
// Live sync layer (Supabase).
//
// The database stores only the DELTA from the seeded tournament — scores,
// round statuses, player edits, hole edits — as key/value rows in one table
// (`rw_kv`), namespaced by STATE_VERSION so a seed change starts a clean
// slate. Every phone merges seed + delta into the same tournament state and
// receives other phones' writes live over Supabase realtime.
//
// Writes are fine-grained (one score = one row), so four scorekeepers can
// enter scores simultaneously without clobbering each other. Because the
// course has dead zones, every write is applied optimistically to the local
// delta and queued in localStorage; the queue flushes whenever a connection
// is available, so nothing is lost out on the back nine.
//
// Table setup (run once in the Supabase SQL editor):
//
//   create table if not exists public.rw_kv (
//     id text primary key,
//     value jsonb,
//     updated_at timestamptz default now()
//   );
//   alter table public.rw_kv enable row level security;
//   create policy "open read"   on public.rw_kv for select using (true);
//   create policy "open insert" on public.rw_kv for insert with check (true);
//   create policy "open update" on public.rw_kv for update using (true);
//   create policy "open delete" on public.rw_kv for delete using (true);
//   alter publication supabase_realtime add table public.rw_kv;
// ---------------------------------------------------------------------------

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RoundStatus, TournamentState } from "../types";
import { STATE_VERSION } from "../data/seed";
import { supabaseConfig } from "./supabaseConfig";

export const syncEnabled = Boolean(supabaseConfig);

const TABLE = "rw_kv";
const V = `v${STATE_VERSION}`;
const PENDING_KEY = "red-walleye-pending-v1";

let supabase: SupabaseClient | null = null;
if (supabaseConfig) {
  supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);
}

// --- Remote data shape (all optional deltas) --------------------------------

export interface RemoteRound {
  status?: RoundStatus;
  courseId?: string;
  teeName?: string;
}

export interface RemoteData {
  scores?: Record<string, Record<string, Record<string, number>>>;
  rounds?: Record<string, RemoteRound>;
  players?: Record<string, { name?: string; handicap?: number }>;
  holes?: Record<string, Record<string, { par?: number; strokeIndex?: number }>>;
}

const holeKey = (n: number) => `h${n}`;
const holeNum = (k: string) => Number(k.replace(/^h/, ""));

/** Merge the remote delta over a fresh seed. Pure — unit tested. */
export function applyRemote(base: TournamentState, remote: RemoteData | null): TournamentState {
  if (!remote) return base;
  const state = structuredClone(base);

  for (const [matchId, byKey] of Object.entries(remote.scores ?? {})) {
    const match = state.matches.find((m) => m.id === matchId);
    if (!match || !byKey) continue;
    for (const [scoreKey, byHole] of Object.entries(byKey)) {
      if (!byHole) continue;
      const forKey = { ...(match.scores[scoreKey] ?? {}) };
      for (const [hk, value] of Object.entries(byHole)) {
        if (value == null) continue;
        forKey[holeNum(hk)] = value;
      }
      match.scores[scoreKey] = forKey;
    }
  }

  for (const [roundId, patch] of Object.entries(remote.rounds ?? {})) {
    const round = state.rounds.find((r) => r.id === roundId);
    if (!round || !patch) continue;
    if (patch.status) round.status = patch.status;
    if (patch.courseId) round.courseId = patch.courseId;
    if (patch.teeName) round.teeName = patch.teeName;
  }

  for (const [playerId, patch] of Object.entries(remote.players ?? {})) {
    const player = state.players.find((p) => p.id === playerId);
    if (!player || !patch) continue;
    if (patch.name != null) player.name = patch.name;
    if (patch.handicap != null) player.handicap = patch.handicap;
  }

  for (const [courseId, byHole] of Object.entries(remote.holes ?? {})) {
    const course = state.courses.find((c) => c.id === courseId);
    if (!course || !byHole) continue;
    for (const [hk, patch] of Object.entries(byHole)) {
      if (!patch) continue;
      const hole = course.holes.find((h) => h.number === holeNum(hk));
      if (!hole) continue;
      if (patch.par != null) hole.par = patch.par;
      if (patch.strokeIndex != null) hole.strokeIndex = patch.strokeIndex;
    }
  }

  return state;
}

// --- Key/value codec ---------------------------------------------------------
// Row ids look like  v5|scores|r1m1|hunter|h3   /   v5|rounds|r1
// ("|" never appears in our ids; scoreKeys may contain ":", which is fine.)

type Kv = Map<string, unknown>;

/** Rebuild the RemoteData tree from flat kv rows. Pure — unit tested. */
export function kvToRemote(kv: Map<string, unknown>): RemoteData {
  const remote: RemoteData = {};
  for (const [id, value] of kv) {
    const parts = id.split("|");
    if (parts[0] !== V || value == null) continue;
    const [, kind, a, b, c] = parts;
    if (kind === "scores" && a && b && c) {
      ((remote.scores ??= {})[a] ??= {})[b] ??= {};
      remote.scores[a][b][c] = value as number;
    } else if (kind === "rounds" && a) {
      (remote.rounds ??= {})[a] = value as RemoteRound;
    } else if (kind === "players" && a) {
      (remote.players ??= {})[a] = value as { name?: string; handicap?: number };
    } else if (kind === "holes" && a && b) {
      ((remote.holes ??= {})[a] ??= {})[b] = value as { par?: number; strokeIndex?: number };
    }
  }
  return remote;
}

// --- Live state: local kv mirror + pending write queue -----------------------

const kv: Kv = new Map();
let notifyData: ((data: RemoteData) => void) | null = null;
let notifyConnected: ((connected: boolean) => void) | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;

interface PendingOp {
  id: string;
  value: unknown | null; // null = delete
}

function loadPending(): PendingOp[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]") as PendingOp[];
  } catch {
    return [];
  }
}

function savePending(ops: PendingOp[]): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(ops));
  } catch {
    /* keep going in memory */
  }
}

function emit(): void {
  notifyData?.(kvToRemote(kv));
}

/** Apply an op to the local mirror and queue it for the server. */
function write(id: string, value: unknown | null): void {
  if (value == null) kv.delete(id);
  else kv.set(id, value);
  emit();
  const ops = loadPending().filter((op) => op.id !== id); // newest write wins
  ops.push({ id, value });
  savePending(ops);
  void flush();
}

let flushing = false;
async function flush(): Promise<void> {
  if (!supabase || flushing) return;
  flushing = true;
  try {
    let ops = loadPending();
    while (ops.length > 0) {
      const op = ops[0];
      const result =
        op.value == null
          ? await supabase.from(TABLE).delete().eq("id", op.id)
          : await supabase.from(TABLE).upsert({ id: op.id, value: op.value });
      if (result.error) break; // offline or rejected — retry later
      ops = loadPending().filter((o) => o.id !== op.id || o.value !== op.value);
      savePending(ops);
    }
  } finally {
    flushing = false;
  }
}

// --- Subscriptions -----------------------------------------------------------

/** Stream the merged event delta. Fires immediately with the local mirror
 *  (cached optimistic writes included), then on every remote change. */
export function subscribeRemote(cb: (data: RemoteData | null) => void): () => void {
  if (!supabase) return () => {};
  notifyData = cb;

  // Optimistic boot: replay any pending offline writes onto the mirror.
  for (const op of loadPending()) {
    if (op.value == null) kv.delete(op.id);
    else kv.set(op.id, op.value);
  }
  emit();

  // Full fetch, then live changes.
  void supabase
    .from(TABLE)
    .select("id,value")
    .like("id", `${V}|%`)
    .then(({ data, error }) => {
      if (error || !data) return;
      kv.clear();
      for (const row of data) kv.set(row.id as string, row.value);
      for (const op of loadPending()) {
        if (op.value == null) kv.delete(op.id);
        else kv.set(op.id, op.value);
      }
      emit();
    });

  const channel = supabase
    .channel("rw-live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: TABLE },
      (payload) => {
        const newRow = payload.new as { id?: string; value?: unknown };
        const oldRow = payload.old as { id?: string };
        if (payload.eventType === "DELETE") {
          if (oldRow?.id) kv.delete(oldRow.id);
        } else if (newRow?.id) {
          kv.set(newRow.id, newRow.value);
        }
        emit();
      },
    )
    .subscribe((status) => {
      const connected = status === "SUBSCRIBED";
      notifyConnected?.(connected);
      if (connected) void flush();
    });

  // Keep retrying queued writes: on regained network and on a slow timer.
  const onOnline = () => void flush();
  window.addEventListener("online", onOnline);
  flushTimer = setInterval(() => {
    if (loadPending().length > 0) void flush();
  }, 15000);

  return () => {
    notifyData = null;
    window.removeEventListener("online", onOnline);
    if (flushTimer) clearInterval(flushTimer);
    void supabase?.removeChannel(channel);
  };
}

/** True when the realtime channel is live. */
export function subscribeConnected(cb: (connected: boolean) => void): () => void {
  notifyConnected = cb;
  return () => {
    notifyConnected = null;
  };
}

// --- Writes ------------------------------------------------------------------

export const remoteWrite = {
  score(matchId: string, scoreKey: string, hole: number, value: number | null): void {
    write(`${V}|scores|${matchId}|${scoreKey}|${holeKey(hole)}`, value);
  },

  /** Merges over the currently-known round value so a status-only write
   *  (finish) never wipes the courseId/teeName picked at start. */
  round(roundId: string, patch: RemoteRound): void {
    const id = `${V}|rounds|${roundId}`;
    const current = (kv.get(id) as RemoteRound | undefined) ?? {};
    write(id, { ...current, ...patch });
  },

  player(playerId: string, patch: { name?: string; handicap?: number }): void {
    const id = `${V}|players|${playerId}`;
    const current = (kv.get(id) as object | undefined) ?? {};
    write(id, { ...current, ...patch });
  },

  hole(courseId: string, hole: number, patch: { par?: number; strokeIndex?: number }): void {
    const id = `${V}|holes|${courseId}|${holeKey(hole)}`;
    const current = (kv.get(id) as object | undefined) ?? {};
    write(id, { ...current, ...patch });
  },

  /** Wipes the shared event data for EVERYONE. */
  resetAll(): void {
    const ids = [...kv.keys()];
    kv.clear();
    savePending([]);
    emit();
    if (supabase) {
      void supabase.from(TABLE).delete().like("id", `${V}|%`);
    }
    void ids;
  },
};
