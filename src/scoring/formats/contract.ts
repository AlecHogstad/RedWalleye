// ---------------------------------------------------------------------------
// Format plugin contract.
//
// A game FORMAT (four-ball, scramble, and later singles / skins / 4-man best
// ball) is described by one FormatPlugin: its identity + labels, the structural
// facts the UI needs (how many seats a side, whether players hole their own
// ball or the group enters one team ball, whether it's a head-to-head match or
// a round-wide field), and its scoring behaviour (stroke allocation + how a
// round's matches roll up into team points).
//
// The engine (`../engine`) stays a pure library of per-format math; plugins
// COMPOSE those functions into a uniform interface so the standings loop and
// the screens never branch on a format literal. Adding a format is a new file
// here plus one registry line — no edits to the core scoring loop.
//
// Phase 2 will thread user-owned House Rules (configurable point values,
// handicap allowance) through `allocateStrokes` / `scoreRound` / the rule
// sections; today those are fixed to reproduce current behaviour exactly.
// ---------------------------------------------------------------------------

import type { Match, Player, RuleSection } from "../../types";
import type { MatchState, ScoringContext, StrokeAllocation } from "../engine";

/** The result of scoring one round's worth of matches for a format. */
export interface RoundScore {
  /** Per-match display state, keyed by matchId (the same rich shape the
   *  scorecard / rounds / ticker screens already render). */
  states: Record<string, MatchState>;
  /** Points earned by each team this round, keyed by teamId. Reflects only
   *  locked/complete bets, so summing across rounds gives live standings. */
  teamPoints: Record<string, number>;
}

export interface FormatPlugin {
  id: Match["format"];
  labels: { long: string; short: string };
  /** Plain-language rules for the format sheet (see FORMAT_RULE_SECTIONS). */
  ruleSections: RuleSection[];

  // --- Structural facts the UI reads instead of testing a format literal ----
  /** "match" = head-to-head A vs B; "field" = one score per group racing the
   *  whole field over the round (scramble placement). */
  scope: "match" | "field";
  /** "AvsB" = two opposing sides per match; "group" = a single group per slot. */
  sides: "AvsB" | "group";
  /** Golfers on each side of a match (2 for best ball, 4 for scramble). */
  seatsPerSide: number;
  /** "per-player" = each golfer holes their own ball; "team-ball" = the group
   *  enters one score under `team:<teamId>`. */
  entry: "per-player" | "team-ball";

  // --- Scoring behaviour ----------------------------------------------------
  /** Match strokes per scoring entity (delegates to the engine today). */
  allocateStrokes(match: Match, players: Player[], ctx: ScoringContext): StrokeAllocation;
  /** Score one round's matches (all share this format) into per-match states
   *  plus team points. */
  scoreRound(matches: Match[], players: Player[], ctx: ScoringContext): RoundScore;
}
