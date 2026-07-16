// ---------------------------------------------------------------------------
// Side-game plugin contract.
//
// Side games are the social bets layered on top of a match — they never touch
// the A-vs-B tournament standings. Two shapes exist:
//   - "derived": computed purely from the scores already entered (Stableford).
//   - "manual":  a piece of stored state the group toggles by hand (Snake's
//                current holder / three-putt count).
//
// Each is one SideGamePlugin: identity, which formats it fits, its shape, and
// its configurable House Rules (points table, pot size). Adding a side game is
// a new file + one registry line.
// ---------------------------------------------------------------------------

import type { Match, Player, RuleField, Rules } from "../../types";
import type { ScoringContext, StablefordRow } from "../engine";
import type { FormatPlugin } from "../formats/contract";

/** Result of a derived side game — per-player standings rows. */
export interface SideGameResult {
  rows: StablefordRow[];
}

export interface SideGamePlugin {
  id: string;
  label: string;
  /** "derived" reads the scorecard; "manual" tracks a stored holder/count. */
  kind: "derived" | "manual";
  /** Whether this side game makes sense for a given format (e.g. Stableford
   *  needs each golfer holing their own ball). */
  appliesTo(format: FormatPlugin): boolean;

  /** Shipped defaults, merged under any House Rule overrides. */
  defaultRules: Rules;
  /** Describes each editable knob for the House Rules screen. */
  rulesSchema: RuleField[];

  /** Derived games only: standings under the given rules. */
  compute?(match: Match, players: Player[], ctx: ScoringContext, rules: Rules): SideGameResult;
}
