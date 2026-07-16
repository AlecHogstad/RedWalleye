// Side-game registry — the one place that knows every side game. Adding one is
// a new plugin file + one entry here; the scorecard and House Rules screen read
// plugin metadata + resolved rules instead of hardcoding each game.

import type { HouseRules, Match, Player, Rules } from "../../types";
import type { ScoringContext, StablefordRow } from "../engine";
import type { SideGamePlugin } from "./contract";
import { snake } from "./snake";
import { stableford } from "./stableford";

export const SIDEGAME_REGISTRY: Record<string, SideGamePlugin> = {
  stableford,
  snake,
};

export function getSideGame(id: string): SideGamePlugin | undefined {
  return SIDEGAME_REGISTRY[id];
}

/** A side game's effective rules: its defaults with any House Rule overrides. */
export function resolveSideGameRules(id: string, houseRules?: HouseRules): Rules {
  const plugin = SIDEGAME_REGISTRY[id];
  return { ...(plugin?.defaultRules ?? {}), ...(houseRules?.sideGames?.[id] ?? {}) };
}

/** Stableford standings for a match under the current House Rules. */
export function stablefordRowsFor(
  match: Match,
  players: Player[],
  ctx: ScoringContext,
  houseRules?: HouseRules,
): StablefordRow[] {
  return stableford.compute?.(match, players, ctx, resolveSideGameRules("stableford", houseRules)).rows ?? [];
}

export type { SideGamePlugin, SideGameResult } from "./contract";
