// ---------------------------------------------------------------------------
// Draft order — pure helpers, unit-tested.
//
// Two teams of eight. Each team's captain is pre-assigned, so 14 players are
// drafted (7 per side) alternating every other pick (A, B, A, B, …). Simple
// and fast to run at the bar; whoever wins the coin flip picks first.
// ---------------------------------------------------------------------------

import type { TournamentState } from "../types";

export type DraftTeam = "tA" | "tB";

/** Players drafted after the two captains (7 per team). */
export const PICKS_TOTAL = 14;

/** Which team owns the pick at `index` (0-based) — alternating every other. */
export function pickTeam(index: number, firstPick: DraftTeam): DraftTeam {
  const other: DraftTeam = firstPick === "tA" ? "tB" : "tA";
  return index % 2 === 0 ? firstPick : other;
}

/** Whose turn it is given the picks made so far, or null once the draft fills. */
export function currentPickTeam(
  picks: string[],
  firstPick: DraftTeam,
): DraftTeam | null {
  if (picks.length >= PICKS_TOTAL) return null;
  return pickTeam(picks.length, firstPick);
}

/** How many picks a team still has coming. */
export function picksLeftFor(
  team: DraftTeam,
  picks: string[],
  firstPick: DraftTeam,
): number {
  let n = 0;
  for (let i = picks.length; i < PICKS_TOTAL; i++) {
    if (pickTeam(i, firstPick) === team) n += 1;
  }
  return n;
}

/** Draft has started (captains set, picks underway or finished). */
export function draftHasRosters(state: TournamentState): boolean {
  const d = state.draft;
  return !!(
    d &&
    d.status !== "setup" &&
    d.firstPick &&
    d.captainA &&
    d.captainB
  );
}

/** Team roster for UI — from the draft when one is running, never the seed split. */
export function teamRosterIds(state: TournamentState, team: DraftTeam): string[] {
  const d = state.draft;
  if (!draftHasRosters(state) || !d) return [];
  return rosterFromDraft(
    team,
    d.picks,
    d.firstPick!,
    d.captainA!,
    d.captainB!,
  );
}

/** Captain + draft-ordered picks for one team — authoritative for draft UI. */
export function rosterFromDraft(
  team: DraftTeam,
  picks: string[],
  firstPick: DraftTeam,
  captainA: string,
  captainB: string,
): string[] {
  const captain = team === "tA" ? captainA : captainB;
  const drafted = picks.filter((_, i) => pickTeam(i, firstPick) === team);
  return [captain, ...drafted];
}

/** Align `Player.teamId` with the draft order (fixes sync rows that lag). */
export function reconcileDraftTeams(state: TournamentState): void {
  const draft = state.draft;
  if (!draft || draft.status === "setup" || !draft.firstPick) return;

  const assign = (playerId: string | undefined, team: DraftTeam) => {
    if (!playerId) return;
    const p = state.players.find((pl) => pl.id === playerId);
    if (p && p.teamId !== team) p.teamId = team;
  };

  assign(draft.captainA, "tA");
  assign(draft.captainB, "tB");

  for (let i = 0; i < draft.picks.length; i++) {
    assign(draft.picks[i], pickTeam(i, draft.firstPick));
  }
}
