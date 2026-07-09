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

import { getSupabaseClient } from "./client";
import type {
  ActivityEvent,
  DraftState,
  MatchSideGames,
  RoundStatus,
  Side,
  TournamentState,
} from "../types";
// (STATE_VERSION intentionally not imported — sync channel is version-independent)
import { supabaseConfig } from "./supabaseConfig";
import { deleteAllTripMedia, startMediaFlushLoop } from "./media";

export const syncEnabled = Boolean(supabaseConfig);

const TABLE = "rw_kv";
// STABLE sync channel — deliberately NOT tied to STATE_VERSION. Every device
// shares this one namespace regardless of which app build it's running, so a
// version bump (or a phone on a cached older bundle) can never silently split
// people onto separate channels. A genuine fresh start is done via Reset,
// which clears every row under this prefix. (Match/player ids are stable
// across versions, so old deltas keep applying; unknown ids are ignored.)
const V = "rw";
const PENDING_KEY = "red-walleye-pending-v1";

// The one shared app-wide client (see client.ts) — sharing it with the media
// layer avoids a second GoTrueClient under the same auth storage key.
const getClient = getSupabaseClient;

// --- Remote data shape (all optional deltas) --------------------------------

export interface RemoteRound {
  status?: RoundStatus;
  courseId?: string;
  teeName?: string;
}

/** A player delta: field edits, a team (re)assignment (empty string = pool),
 *  a full add (name + handicap present for an id not in the seed), or a
 *  tombstone (`deleted`) that keeps a seed player gone after a reset merge. */
export interface RemotePlayer {
  name?: string;
  handicap?: number;
  teamId?: string;
  deleted?: boolean;
}

export interface RemoteData {
  scores?: Record<string, Record<string, Record<string, number>>>;
  rounds?: Record<string, RemoteRound>;
  players?: Record<string, RemotePlayer>;
  holes?: Record<string, Record<string, { par?: number; strokeIndex?: number }>>;
  teams?: Record<string, { name?: string }>;
  matches?: Record<string, { sideA?: Side; sideB?: Side }>;
  sideGames?: Record<string, MatchSideGames>;
  activity?: Record<string, ActivityEvent>;
  /** The draft singleton (whole object, overwritten on each write). */
  draft?: DraftState;
}

const holeKey = (n: number) => `h${n}`;
const holeNum = (k: string) => Number(k.replace(/^h/, ""));
const DRAFT_ROW_ID = `${V}|draft|state`;

/** Never let a lagging fetch/realtime row roll back draft progress. */
export function mergeDraftState(
  current: DraftState | undefined,
  incoming: DraftState,
): DraftState {
  if (!current) return incoming;
  const curRev = current.rev ?? 0;
  const incRev = incoming.rev ?? 0;
  if (incRev < curRev) return current;
  if (incRev > curRev) return incoming;
  if (incoming.picks.length < current.picks.length) return current;
  if (incoming.picks.length > current.picks.length) return incoming;
  if (incoming.status === "done" && current.status !== "done") return incoming;
  return incoming;
}

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

  for (const [teamId, patch] of Object.entries(remote.teams ?? {})) {
    const team = state.teams.find((t) => t.id === teamId);
    if (!team || !patch) continue;
    if (patch.name != null) team.name = patch.name;
  }

  for (const [playerId, patch] of Object.entries(remote.players ?? {})) {
    if (!patch) continue;
    const existing = state.players.find((p) => p.id === playerId);
    if (patch.deleted) {
      if (existing) {
        state.players = state.players.filter((p) => p.id !== playerId);
      }
      continue;
    }
    if (existing) {
      if (patch.name != null) existing.name = patch.name;
      if (patch.handicap != null) existing.handicap = patch.handicap;
      if (patch.teamId != null) existing.teamId = patch.teamId;
    } else if (patch.name != null && patch.handicap != null) {
      // A player added on another phone that isn't in the seed.
      state.players.push({
        id: playerId,
        name: patch.name,
        handicap: patch.handicap,
        teamId: patch.teamId ?? "",
      });
    }
  }

  for (const [matchId, patch] of Object.entries(remote.matches ?? {})) {
    const match = state.matches.find((m) => m.id === matchId);
    if (!match || !patch) continue;
    if (patch.sideA) match.sideA = patch.sideA;
    if (patch.sideB) match.sideB = patch.sideB;
  }

  for (const [matchId, patch] of Object.entries(remote.sideGames ?? {})) {
    if (!patch) continue;
    state.sideGames[matchId] = { ...(state.sideGames[matchId] ?? {}), ...patch };
  }

  const events = Object.values(remote.activity ?? {}).filter(Boolean);
  if (events.length > 0) {
    state.activity = [...state.activity, ...events].sort((a, b) => a.ts - b.ts);
  }

  if (remote.draft) state.draft = remote.draft;

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
      (remote.players ??= {})[a] = value as RemotePlayer;
    } else if (kind === "holes" && a && b) {
      ((remote.holes ??= {})[a] ??= {})[b] = value as { par?: number; strokeIndex?: number };
    } else if (kind === "teams" && a) {
      (remote.teams ??= {})[a] = value as { name?: string };
    } else if (kind === "matches" && a) {
      (remote.matches ??= {})[a] = value as { sideA?: Side; sideB?: Side };
    } else if (kind === "sidegames" && a) {
      (remote.sideGames ??= {})[a] = value as MatchSideGames;
    } else if (kind === "activity" && a) {
      (remote.activity ??= {})[a] = value as ActivityEvent;
    } else if (kind === "draft" && a === "state") {
      remote.draft = value as DraftState;
    }
  }
  return remote;
}

// --- Live state: local kv mirror + pending write queue -----------------------

const kv: Kv = new Map();
let notifyData: ((data: RemoteData) => void) | null = null;
let notifyConnected: ((connected: boolean) => void) | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;
// Bumps on every reset. In-flight async work (a flush mid-upsert, a reset's
// own deletes) checks it and bails when it changes, so a write that was
// already sent can't quietly re-create a row the user just wiped.
let generation = 0;
// While a reset is settling, ignore every incoming server row — the local
// mirror is authoritative (empty) and we don't want a racing echo to refill it.
let suppressIncoming = false;

// On-screen diagnostics (Settings > Reset) — a phone-readable console, since
// iOS Safari can't be inspected in the field.
const syncDebug = {
  live: 0, // realtime events received
  lastFetchAt: 0, // epoch ms of last successful reconcile
  lastRows: 0, // rows in that reconcile
  lastError: "", // last fetch/write failure
};
export function getSyncDebug(): {
  live: number;
  lastFetchAt: number;
  lastRows: number;
  lastError: string;
  pending: number;
  mirror: number;
} {
  return {
    ...syncDebug,
    pending: loadPending().length,
    mirror: kv.size,
  };
}

function writeLocal(id: string, value: unknown | null): void {
  if (value == null) kv.delete(id);
  else kv.set(id, value);
}

/** Is there an unflushed local write for this id? */
function pendingHasId(id: string): boolean {
  return loadPending().some((op) => op.id === id);
}

/** Apply a server row — draft uses merge rules; local writes bypass this. */
function mergeIncomingRow(id: string, value: unknown | null): void {
  // A reset is in progress — the server rows are on their way out; don't apply.
  if (suppressIncoming) return;
  // A local write for this row hasn't flushed yet: the optimistic value wins
  // until it's confirmed, so a stale echo can't clobber it (e.g. finish a round
  // and a lagging "active" echo flips it back — the bounce).
  if (pendingHasId(id)) return;
  if (value == null) {
    kv.delete(id);
    return;
  }
  if (id === DRAFT_ROW_ID) {
    kv.set(id, mergeDraftState(kv.get(id) as DraftState | undefined, value as DraftState));
    return;
  }
  kv.set(id, value);
}

function queueWrite(id: string, value: unknown | null): void {
  const ops = loadPending().filter((op) => op.id !== id);
  ops.push({ id, value });
  savePending(ops);
}

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
  writeLocal(id, value);
  emit();
  queueWrite(id, value);
  void flush();
}

/** Several rows that must land together (draft pick + player team). */
function writeMany(rows: { id: string; value: unknown | null }[]): void {
  for (const { id, value } of rows) {
    writeLocal(id, value);
    queueWrite(id, value);
  }
  emit();
  void flush();
}

/** Abort a hung Supabase request instead of leaving the flush/fetch loop stuck
 *  forever with nothing logged — iOS Safari and flaky course signal can hang a
 *  request that never resolves or rejects on its own. */
async function withTimeout<T>(
  run: (signal: AbortSignal) => PromiseLike<T>,
  ms = 12000,
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await run(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

let flushing = false;
async function flush(): Promise<void> {
  const supabase = getClient();
  if (!supabase || flushing) return;
  flushing = true;
  const g = generation; // if a reset bumps this mid-flush, abandon these writes
  try {
    let ops = loadPending();
    while (ops.length > 0) {
      if (g !== generation) return; // a reset happened — don't send stale writes
      const op = ops[0];
      try {
        const result =
          op.value == null
            ? await withTimeout((s) => supabase.from(TABLE).delete().eq("id", op.id).abortSignal(s))
            : await withTimeout((s) =>
                supabase.from(TABLE).upsert({ id: op.id, value: op.value }).abortSignal(s),
              );
        // A reset landed while this write was in flight: leave the freshly-
        // cleared queue alone so a just-sent row can't be re-recorded.
        if (g !== generation) return;
        if (result.error) {
          syncDebug.lastError = `write: ${result.error.message ?? result.error}`;
          console.error(
            `[rw-sync] WRITE FAILED for "${op.id}":`,
            result.error.message ?? result.error,
            result.error,
          );
          break; // rejected — retry on next tick
        }
      } catch (e) {
        // Thrown/aborted (network hang, timeout) — surface it and retry later,
        // instead of silently wedging the queue.
        syncDebug.lastError = `write: ${(e as Error)?.message ?? String(e)}`;
        console.error(`[rw-sync] WRITE THREW for "${op.id}":`, e);
        break;
      }
      console.info(`[rw-sync] wrote "${op.id}"`);
      ops = loadPending().filter((o) => o.id !== op.id || o.value !== op.value);
      savePending(ops);
    }
    if (loadPending().length === 0) console.info("[rw-sync] queue drained");
  } finally {
    flushing = false;
  }
}

// Pull the whole delta and reconcile the local mirror with it. The app can't
// rely on realtime alone — a dropped event (Safari WebSocket hiccup, a phone
// that loaded before another's writes, flaky course signal) would otherwise
// leave a device drifted until a manual reload. So we also re-fetch on
// (re)connect, on tab focus, and on a slow timer, and clients self-heal.
let fetching = false;
async function fetchAll(): Promise<void> {
  const supabase = getClient();
  if (!supabase || fetching || suppressIncoming) return;
  fetching = true;
  const g = generation;
  try {
    let data: { id: string; value: unknown }[] | null;
    let error: { message?: string } | null;
    try {
      ({ data, error } = await withTimeout((s) =>
        supabase.from(TABLE).select("id,value").like("id", `${V}|%`).abortSignal(s),
      ));
    } catch (e) {
      syncDebug.lastError = `fetch: ${(e as Error)?.message ?? String(e)}`;
      console.error("[rw-sync] fetch THREW:", e);
      return;
    }
    if (error) {
      syncDebug.lastError = `fetch: ${error.message ?? error}`;
      console.error("[rw-sync] fetch FAILED:", error.message ?? error, error);
      return;
    }
    // A reset landed while the fetch was in flight — don't reapply old rows.
    if (!data || g !== generation || suppressIncoming) return;

    const serverIds = new Set<string>();
    for (const row of data) {
      serverIds.add(row.id as string);
      mergeIncomingRow(row.id as string, row.value);
    }
    // Drop rows the server no longer has (e.g. a reset on another phone),
    // except ones we still have an unflushed local write for.
    for (const id of [...kv.keys()]) {
      if (id.startsWith(`${V}|`) && !serverIds.has(id) && !pendingHasId(id)) {
        kv.delete(id);
      }
    }
    // Re-assert optimistic writes on top of the fetched truth.
    for (const op of loadPending()) writeLocal(op.id, op.value);
    syncDebug.lastFetchAt = Date.now();
    syncDebug.lastRows = data.length;
    syncDebug.lastError = "";
    console.info(`[rw-sync] reconciled ${data.length} row(s)`);
    emit();
  } finally {
    fetching = false;
  }
}

/**
 * Nuke THIS device's local sync state and re-pull from the server. Fixes a
 * phone that's stuck showing an old snapshot — a poisoned pending write, or a
 * cached mirror — without touching the shared table (so it's safe to tap
 * mid-round and it affects nobody else). Bumping `generation` drops any
 * in-flight flush so a stale queued write can't be re-sent.
 */
export function resyncFromServer(): void {
  generation += 1;
  kv.clear();
  savePending([]);
  emit();
  void fetchAll();
}

// --- Subscriptions -----------------------------------------------------------

/** Stream the merged event delta. Fires immediately with the local mirror
 *  (cached optimistic writes included), then on every remote change. */
export function subscribeRemote(cb: (data: RemoteData | null) => void): () => void {
  const supabase = getClient();
  if (!supabase) return () => {};
  notifyData = cb;

  // Optimistic boot: replay any pending offline writes onto the mirror.
  for (const op of loadPending()) {
    writeLocal(op.id, op.value);
  }
  emit();

  // Full fetch now, and again on every reconnect / focus / timer tick below.
  void fetchAll();

  const channel = supabase
    .channel("rw-live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: TABLE },
      (payload) => {
        syncDebug.live += 1;
        const newRow = payload.new as { id?: string; value?: unknown };
        const oldRow = payload.old as { id?: string };
        console.info(
          `[rw-sync] live ${payload.eventType} "${newRow?.id ?? oldRow?.id}"`,
          newRow?.value ?? null,
        );
        // While a reset settles, ignore live chatter (including echoes of a
        // write that raced the wipe) — the local mirror is authoritative.
        if (suppressIncoming) return;
        if (payload.eventType === "DELETE") {
          if (oldRow?.id && !pendingHasId(oldRow.id)) kv.delete(oldRow.id);
        } else if (newRow?.id) {
          mergeIncomingRow(newRow.id, newRow.value);
        }
        emit();
      },
    )
    .subscribe((status, err) => {
      console.info(`[rw-sync] channel status: ${status}`, err ?? "");
      const connected = status === "SUBSCRIBED";
      notifyConnected?.(connected);
      // On (re)connect, both drain our queue AND re-pull the truth, so a device
      // that missed live events while disconnected catches back up.
      if (connected) {
        void flush();
        void fetchAll();
      }
    });

  // Catch up whenever the app comes back to the foreground.
  const onVisible = () => {
    if (document.visibilityState === "visible") {
      void flush();
      void fetchAll();
    }
  };
  document.addEventListener("visibilitychange", onVisible);

  // Regained network + a slow timer: retry writes AND reconcile against the
  // server, so clients converge even if a realtime event was silently dropped.
  const onOnline = () => {
    void flush();
    void fetchAll();
  };
  window.addEventListener("online", onOnline);
  flushTimer = setInterval(() => {
    if (loadPending().length > 0) void flush();
    void fetchAll();
  }, 15000);

  const stopMediaFlush = startMediaFlushLoop();

  return () => {
    notifyData = null;
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
    if (flushTimer) clearInterval(flushTimer);
    stopMediaFlush();
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

  player(playerId: string, patch: RemotePlayer): void {
    const id = `${V}|players|${playerId}`;
    const current = (kv.get(id) as object | undefined) ?? {};
    write(id, { ...current, ...patch });
  },

  /** Full add for a brand-new player (not in the seed). */
  addPlayer(player: { id: string; name: string; handicap: number; teamId: string }): void {
    write(`${V}|players|${player.id}`, {
      name: player.name,
      handicap: player.handicap,
      teamId: player.teamId,
    });
  },

  /** Tombstone a player so a seed player stays gone across merges. */
  removePlayer(playerId: string): void {
    const id = `${V}|players|${playerId}`;
    const current = (kv.get(id) as object | undefined) ?? {};
    write(id, { ...current, deleted: true });
  },

  team(teamId: string, patch: { name?: string }): void {
    const id = `${V}|teams|${teamId}`;
    const current = (kv.get(id) as object | undefined) ?? {};
    write(id, { ...current, ...patch });
  },

  /** Overwrite a match's sides after a roster change. */
  match(matchId: string, patch: { sideA?: Side; sideB?: Side }): void {
    const id = `${V}|matches|${matchId}`;
    const current = (kv.get(id) as object | undefined) ?? {};
    write(id, { ...current, ...patch });
  },

  /** Per-group side-game opt-ins and snake holder. */
  sideGames(matchId: string, patch: MatchSideGames): void {
    const id = `${V}|sidegames|${matchId}`;
    const current = (kv.get(id) as object | undefined) ?? {};
    write(id, { ...current, ...patch });
  },

  /** Append an activity-feed event (one row per event, never clobbered). */
  addActivity(event: ActivityEvent): void {
    write(`${V}|activity|${event.id}`, event);
  },

  /** Patch an existing activity event (e.g. mark photo upload complete). */
  updateActivity(event: ActivityEvent): void {
    write(`${V}|activity|${event.id}`, event);
  },

  /** Remove an activity-feed event (undo). */
  removeActivity(eventId: string): void {
    write(`${V}|activity|${eventId}`, null);
  },

  hole(courseId: string, hole: number, patch: { par?: number; strokeIndex?: number }): void {
    const id = `${V}|holes|${courseId}|${holeKey(hole)}`;
    const current = (kv.get(id) as object | undefined) ?? {};
    write(id, { ...current, ...patch });
  },

  /** The draft singleton — the whole object is written atomically. */
  draft(draft: DraftState): void {
    write(`${V}|draft|state`, draft);
  },

  /** Draft a player to a team — draft row + team assignment in one emit. */
  draftPick(draft: DraftState, playerId: string, teamId: string): void {
    const playerRow = `${V}|players|${playerId}`;
    const current = (kv.get(playerRow) as object | undefined) ?? {};
    writeMany([
      { id: DRAFT_ROW_ID, value: draft },
      { id: playerRow, value: { ...current, teamId } },
    ]);
  },

  /** Undo the last draft pick — shrink picks and return player to the pool. */
  undoDraftPick(draft: DraftState, playerId: string): void {
    const playerRow = `${V}|players|${playerId}`;
    const current = (kv.get(playerRow) as object | undefined) ?? {};
    writeMany([
      { id: DRAFT_ROW_ID, value: draft },
      { id: playerRow, value: { ...current, teamId: "" } },
    ]);
  },

  /** Wipes the shared event data for EVERYONE. */
  resetAll(): void {
    void hardReset();
  },
};

/**
 * Authoritative wipe. Bumping `generation` invalidates any in-flight flush so
 * a write that's mid-air can't re-create a row we're deleting; `suppressIncoming`
 * makes us ignore the echoes of that write. We delete twice with a gap so a
 * row that landed on the server *during* the first delete still gets cleared —
 * this is why a reset used to drop the scores (already flushed) but leave the
 * just-started/finished round (its write still racing) behind.
 */
async function hardReset(): Promise<void> {
  generation += 1;
  const g = generation;
  suppressIncoming = true;
  kv.clear();
  savePending([]);
  emit();

  const client = getClient();
  if (client) {
    try {
      await client.from(TABLE).delete().like("id", `${V}|%`);
      await new Promise((resolve) => setTimeout(resolve, 600));
      if (g === generation) {
        await client.from(TABLE).delete().like("id", `${V}|%`);
      }
    } catch (err) {
      console.error("[rw-sync] reset delete FAILED:", err);
    }
  }

  // Only settle if no newer reset superseded this one.
  if (g === generation) {
    kv.clear();
    suppressIncoming = false;
    emit();
  }
  void deleteAllTripMedia();
}
