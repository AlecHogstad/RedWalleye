// Stableford — a derived side game. Each golfer scores net points per hole off
// a configurable table; highest total wins. Only where players hole their own
// ball (four-ball, four-man, singles), never a scramble team ball.
//
// House Rules:
//   points  6-tier net table [albatross+, eagle, birdie, par, bogey, double+]
//           (default 5/4/3/2/1/0)

import { computeStableford, STABLEFORD_DEFAULT } from "../engine";
import { listRule } from "../formats/contract";
import type { SideGamePlugin } from "./contract";

export const stableford: SideGamePlugin = {
  id: "stableford",
  label: "Stableford",
  kind: "derived",
  appliesTo: (format) => format.entry === "per-player",

  defaultRules: { points: [...STABLEFORD_DEFAULT] },
  rulesSchema: [
    {
      key: "points",
      label: "Points table",
      help: "Net points per hole: albatross-or-better, eagle, birdie, par, bogey, double-or-worse.",
      kind: "list",
      length: 6,
      min: 0,
      max: 12,
      step: 1,
      unit: "pts",
    },
  ],

  compute: (match, players, ctx, rules) => ({
    rows: computeStableford(match, players, ctx, listRule(rules, "points", [...STABLEFORD_DEFAULT])),
  }),
};
