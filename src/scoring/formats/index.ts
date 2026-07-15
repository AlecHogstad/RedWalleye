// Format registry — the one place that knows every game format. Adding a
// format is a new plugin file + one entry here; the standings loop and the
// screens read plugin metadata instead of branching on a format literal.
//
// Typed as `Record<Format, FormatPlugin>`, so the union in `types.ts` and this
// map stay in lockstep: a new `Format` that isn't registered (or a plugin for a
// format that isn't in the union) is a compile error.

import type { Format } from "../../types";
import type { FormatPlugin } from "./contract";
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

export type { FormatPlugin, RoundScore } from "./contract";
