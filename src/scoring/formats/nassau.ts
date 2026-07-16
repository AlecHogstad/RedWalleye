// Shared builder for head-to-head Nassau formats (four-ball, 4-man best ball,
// singles). They differ only in how many golfers sit on a side — the side's
// best net still counts on each hole, and the front / back / overall bets pay
// the same way. Each is one call to makeNassauFormat.
//
// House Rules (identical across these formats):
//   segmentValue          points per Nassau bet             (default 1)
//   handicapAllowancePct  % of the CH difference as strokes (default 100)

import type { Format, RuleField, RuleSection, Rules } from "../../types";
import { allocateStrokes, computeMatchState } from "../engine";
import { numRule, type FormatPlugin, type RoundScore } from "./contract";

const NASSAU_RULES_SCHEMA: RuleField[] = [
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
    help: "Share of the course-handicap difference given as strokes. 100% is full; 90% is a common best-ball rule.",
    kind: "number",
    min: 0,
    max: 100,
    step: 5,
    unit: "%",
  },
];

export function makeNassauFormat(opts: {
  id: Format;
  labels: { long: string; short: string };
  ruleSections: RuleSection[];
  seatsPerSide: number;
}): FormatPlugin {
  const optsFor = (rules: Rules) => ({
    segValue: numRule(rules, "segmentValue", 1),
    allowancePct: numRule(rules, "handicapAllowancePct", 100),
  });
  const matchState: FormatPlugin["matchState"] = (match, players, ctx, rules) =>
    computeMatchState(match, players, ctx, optsFor(rules));

  return {
    id: opts.id,
    labels: opts.labels,
    ruleSections: opts.ruleSections,
    scope: "match",
    sides: "AvsB",
    seatsPerSide: opts.seatsPerSide,
    entry: "per-player",
    defaultRules: { segmentValue: 1, handicapAllowancePct: 100 },
    rulesSchema: NASSAU_RULES_SCHEMA,

    allocateStrokes: (match, players, ctx, rules) =>
      allocateStrokes(match, players, ctx, numRule(rules, "handicapAllowancePct", 100)),
    matchState,
    scoreRound(matches, players, ctx, rules) {
      const states: RoundScore["states"] = {};
      const teamPoints: RoundScore["teamPoints"] = {};
      for (const match of matches) {
        const st = matchState(match, players, ctx, rules);
        states[match.id] = st;
        teamPoints[match.sideA.teamId] = (teamPoints[match.sideA.teamId] ?? 0) + st.points.a;
        teamPoints[match.sideB.teamId] = (teamPoints[match.sideB.teamId] ?? 0) + st.points.b;
      }
      return { states, teamPoints };
    },
  };
}
