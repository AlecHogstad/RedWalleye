// ---------------------------------------------------------------------------
// Snake-draft order — pure helpers, unit-tested.
//
// Two teams of eight. Each team's captain is pre-assigned, so 14 players are
// drafted (7 per side) in a snake: first pick, then the other team picks twice,
// back and forth (A, B, B, A, A, B, B, A, …). That evens out the pick order so
// going second isn't a disadvantage.
// ---------------------------------------------------------------------------

export type DraftTeam = "tA" | "tB";

/** Players drafted after the two captains (7 per team). */
export const PICKS_TOTAL = 14;

/** Which team owns the pick at `index` (0-based) in the snake. */
export function pickTeam(index: number, firstPick: DraftTeam): DraftTeam {
  const other: DraftTeam = firstPick === "tA" ? "tB" : "tA";
  // A B B A | A B B A | … — the first team picks on indexes 0,3,4,7,8,…
  return index % 4 === 0 || index % 4 === 3 ? firstPick : other;
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
