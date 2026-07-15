// Format registry — the one place that knows every game format. Adding a
// format is a new plugin file + one entry here; the standings loop and the
// screens read plugin metadata + resolved House Rules instead of branching on a
// format literal or hardcoding point values.
//
// Typed as `Record<Format, FormatPlugin>`, so the union in `types.ts` and this
// map stay in lockstep: a new `Format` that isn't registered (or a plugin for a
// format that isn't in the union) is a compile error.

import type { Format, HouseRules, Rules } from "../../types";
import type { Match, Player } from "../../types";
import {
  scrambleGroupPlacementPoints,
  type MatchState,
  type ScoringContext,
  type StrokeAllocation,
} from "../engine";
import { listRule, type FormatPlugin } from "./contract";
import { fourball } from "./fourball";
import { scramble } from "./scramble";

export const FORMAT_REGISTRY: Record<Format, FormatPlugin> = {
  fourball,
  scramble,
};

/** The plugin for a format id. */
export function getFormat(id: Format): FormatPlugin {
  return FORMAT_REGISTRY[id];
}

/** Golfers per side for a format (2 best ball, 4 scramble). */
export function seatsPerSide(id: Format): number {
  return FORMAT_REGISTRY[id].seatsPerSide;
}

/** True when the group enters one team ball rather than each player's own. */
export function isTeamBall(id: Format): boolean {
  return FORMAT_REGISTRY[id].entry === "team-ball";
}

/** A format's effective rules: its defaults with any House Rule overrides on
 *  top. Absent overrides (undefined houseRules) yield the shipped defaults. */
export function resolveFormatRules(id: Format, houseRules?: HouseRules): Rules {
  return { ...FORMAT_REGISTRY[id].defaultRules, ...(houseRules?.formats?.[id] ?? {}) };
}

/** Display state for a match under the current House Rules. */
export function matchStateFor(
  match: Match,
  players: Player[],
  ctx: ScoringContext,
  houseRules?: HouseRules,
): MatchState {
  const plugin = getFormat(match.format);
  return plugin.matchState(match, players, ctx, resolveFormatRules(match.format, houseRules));
}

/** Stroke allocation for a match under the current House Rules. */
export function allocStrokesFor(
  match: Match,
  players: Player[],
  ctx: ScoringContext,
  houseRules?: HouseRules,
): StrokeAllocation {
  const plugin = getFormat(match.format);
  return plugin.allocateStrokes(match, players, ctx, resolveFormatRules(match.format, houseRules));
}

/** Placement points for one scramble group under the current House Rules, or
 *  null until every group finishes / for non-field matches. */
export function placementPointsFor(
  match: Match,
  roundMatches: Match[],
  ctx: ScoringContext,
  houseRules?: HouseRules,
): number | null {
  const placePoints = listRule(
    resolveFormatRules("scramble", houseRules),
    "placementPoints",
    [6, 4, 2, 0],
  );
  return scrambleGroupPlacementPoints(match, roundMatches, ctx, placePoints);
}

export { numRule, listRule } from "./contract";
export type { FormatPlugin, RoundScore } from "./contract";
