// Four-ball (2-man best ball) — a head-to-head Nassau per match. Each golfer
// holes their own ball; the side's better net counts on each hole; front / back
// / overall bets pay `segmentValue` points each. Delegates to the engine's
// tested math.
//
// House Rules:
//   segmentValue         points per Nassau bet          (default 1)
//   handicapAllowancePct % of the CH difference as strokes (default 100)

import { FORMAT_LABELS, FORMAT_RULE_SECTIONS, FORMAT_SHORT } from "../../types";
import { allocateStrokes, computeMatchState } from "../engine";
import { numRule, type FormatPlugin, type RoundScore } from "./contract";

export const fourball: FormatPlugin = {
  id: "fourball",
  labels: { long: FORMAT_LABELS.fourball, short: FORMAT_SHORT.fourball },
  ruleSections: FORMAT_RULE_SECTIONS.fourball,
  scope: "match",
  sides: "AvsB",
  seatsPerSide: 2,
  entry: "per-player",

  defaultRules: { segmentValue: 1, handicapAllowancePct: 100 },
  rulesSchema: [
    {
      key: "segmentValue",
      label: "Points per bet",
      help: "The front 9, back 9, and overall 18 each pay this. A halved bet splits it.",
      kind: "number",
      min: 0,
      max: 10,
      step: 0.5,
      unit: "pts",
    },
    {
      key: "handicapAllowancePct",
      label: "Handicap allowance",
      help: "Share of the course-handicap difference given as strokes. 100% is full; 90% is a common four-ball rule.",
      kind: "number",
      min: 0,
      max: 100,
      step: 5,
      unit: "%",
    },
  ],

  allocateStrokes: (match, players, ctx, rules) =>
    allocateStrokes(match, players, ctx, numRule(rules, "handicapAllowancePct", 100)),

  matchState: (match, players, ctx, rules) =>
    computeMatchState(match, players, ctx, {
      segValue: numRule(rules, "segmentValue", 1),
      allowancePct: numRule(rules, "handicapAllowancePct", 100),
    }),

  scoreRound(matches, players, ctx, rules) {
    const states: RoundScore["states"] = {};
    const teamPoints: RoundScore["teamPoints"] = {};
    for (const match of matches) {
      const st = this.matchState(match, players, ctx, rules);
      states[match.id] = st;
      teamPoints[match.sideA.teamId] = (teamPoints[match.sideA.teamId] ?? 0) + st.points.a;
      teamPoints[match.sideB.teamId] = (teamPoints[match.sideB.teamId] ?? 0) + st.points.b;
    }
    return { states, teamPoints };
  },
};
