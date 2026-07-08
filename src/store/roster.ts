// ---------------------------------------------------------------------------
// Roster reconciliation — pure helpers for editing which players belong to a
// team and keeping every match's sides in step.
//
// Roster edits are only allowed while all rounds are still `pending` (enforced
// in the store), so there are never scores to preserve when a player leaves a
// side. The helpers still move score keys along on a straight swap, so they
// stay correct if that guard is ever relaxed.
// ---------------------------------------------------------------------------

import type { Match, Side, TournamentState } from "../types";

/** A minimal side patch for one match, for syncing structural changes. */
export interface MatchSidePatch {
  id: string;
  sideA: Side;
  sideB: Side;
}

export interface RosterReconcile {
  next: TournamentState;
  /** Matches whose sides changed — emit as remote writes in synced mode. */
  matchPatches: MatchSidePatch[];
  /** Players whose team assignment changed. */
  playerTeamChanges: { id: string; teamId: string }[];
}

/** Which side (if any) of a match belongs to a team. */
function teamSide(match: Match, teamId: string): "A" | "B" | null {
  if (match.sideA.teamId === teamId) return "A";
  if (match.sideB.teamId === teamId) return "B";
  return null;
}

function capacityFor(match: Match): number {
  return match.format === "fourman" ? 4 : 2;
}

/** A team's roster in canonical order: the 4-man entry when present (it holds
 *  the whole team), otherwise every player tagged with the team. */
export function rosterOf(state: TournamentState, teamId: string): string[] {
  const fourman = state.matches.find(
    (m) => m.format === "fourman" && m.sideA.teamId === teamId,
  );
  if (fourman) return [...fourman.sideA.playerIds];
  return state.players.filter((p) => p.teamId === teamId).map((p) => p.id);
}

function removePlayerFromTeam(
  state: TournamentState,
  teamId: string,
  playerId: string,
): void {
  for (const m of state.matches) {
    const side = teamSide(m, teamId);
    if (!side) continue;
    const s = side === "A" ? m.sideA : m.sideB;
    if (s.playerIds.includes(playerId)) {
      s.playerIds = s.playerIds.filter((id) => id !== playerId);
    }
    if (playerId in m.scores) delete m.scores[playerId];
  }
}

/** Add a player into each round's team side that still has room (once per
 *  round), plus the 4-man entry. */
function addPlayerToTeam(
  state: TournamentState,
  teamId: string,
  playerId: string,
): void {
  const byRound = new Map<string, Match[]>();
  for (const m of state.matches) {
    if (!teamSide(m, teamId)) continue;
    const list = byRound.get(m.roundId) ?? [];
    list.push(m);
    byRound.set(m.roundId, list);
  }
  for (const ms of byRound.values()) {
    const target = ms.find((m) => {
      const side = teamSide(m, teamId)!;
      const s = side === "A" ? m.sideA : m.sideB;
      return s.playerIds.length < capacityFor(m) && !s.playerIds.includes(playerId);
    });
    if (!target) continue;
    const side = teamSide(target, teamId)!;
    const s = side === "A" ? target.sideA : target.sideB;
    s.playerIds = [...s.playerIds, playerId];
    if (target.format !== "scramble" && !(playerId in target.scores)) {
      target.scores[playerId] = {};
    }
  }
}

/**
 * Reconcile a team's roster to exactly `newIds`, updating player team tags and
 * every affected match side. Incoming players are detached from any prior team
 * first. Returns the next state plus the granular changes needed to sync.
 */
export function reconcileRoster(
  state0: TournamentState,
  teamId: string,
  newIds: string[],
): RosterReconcile {
  const state = structuredClone(state0);
  const current = rosterOf(state, teamId);
  const currentSet = new Set(current);
  const newSet = new Set(newIds);
  const removed = current.filter((id) => !newSet.has(id));
  const added = newIds.filter((id) => !currentSet.has(id));

  const playerTeamChanges: { id: string; teamId: string }[] = [];

  for (const id of removed) {
    removePlayerFromTeam(state, teamId, id);
    const p = state.players.find((x) => x.id === id);
    if (p && p.teamId !== "") {
      p.teamId = "";
      playerTeamChanges.push({ id, teamId: "" });
    }
  }

  for (const id of added) {
    const p = state.players.find((x) => x.id === id);
    const priorTeam = p?.teamId;
    if (priorTeam && priorTeam !== teamId) {
      removePlayerFromTeam(state, priorTeam, id);
    }
    addPlayerToTeam(state, teamId, id);
    if (p && p.teamId !== teamId) {
      p.teamId = teamId;
      playerTeamChanges.push({ id, teamId });
    }
  }

  const matchPatches: MatchSidePatch[] = [];
  for (const m of state.matches) {
    const before = state0.matches.find((x) => x.id === m.id);
    if (!before) continue;
    const changed =
      JSON.stringify(before.sideA) !== JSON.stringify(m.sideA) ||
      JSON.stringify(before.sideB) !== JSON.stringify(m.sideB);
    if (changed) {
      matchPatches.push({ id: m.id, sideA: m.sideA, sideB: m.sideB });
    }
  }

  return { next: state, matchPatches, playerTeamChanges };
}
