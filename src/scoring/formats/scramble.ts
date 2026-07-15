// Scramble — a round-wide field, not a head-to-head match. Each group enters
// one raw team ball (no handicap); all groups race the same course and the four
// 18-hole totals place by `placementPoints` (ties split). A team adds up both
// its groups. Points lock only once every group has finished.
//
// House Rules:
//   placementPoints  points for 1st / 2nd / 3rd / 4th by gross (default 6/4/2/0)

import { FORMAT_LABELS, FORMAT_RULE_SECTIONS, FORMAT_SHORT } from "../../types";
import {
  computeMatchState,
  computeScrambleGroupTotal,
  computeScramblePlacement,
  isScrambleFieldMatch,
  teamScoreKey,
} from "../engine";
import { listRule, type FormatPlugin, type RoundScore } from "./contract";

const DEFAULT_PLACEMENT = [6, 4, 2, 0];

export const scramble: FormatPlugin = {
  id: "scramble",
  labels: { long: FORMAT_LABELS.scramble, short: FORMAT_SHORT.scramble },
  ruleSections: FORMAT_RULE_SECTIONS.scramble,
  scope: "field",
  sides: "group",
  seatsPerSide: 4,
  entry: "team-ball",

  defaultRules: { placementPoints: DEFAULT_PLACEMENT },
  rulesSchema: [
    {
      key: "placementPoints",
      label: "Placement points",
      help: "Points for 1st / 2nd / 3rd / 4th place by 18-hole gross. Ties split the places they occupy.",
      kind: "list",
      length: 4,
      min: 0,
      max: 20,
      step: 1,
      unit: "pts",
    },
  ],

  // Scramble is the raw team ball — no strokes regardless of allowance.
  allocateStrokes: (match, _players, _ctx) => ({
    byPlayer: {},
    byTeam: {
      [teamScoreKey(match.sideA.teamId)]: 0,
      [teamScoreKey(match.sideB.teamId)]: 0,
    },
  }),

  matchState: (match, players, ctx) => computeMatchState(match, players, ctx),

  scoreRound(matches, players, ctx, rules) {
    const placePoints = listRule(rules, "placementPoints", DEFAULT_PLACEMENT);
    const states: RoundScore["states"] = {};
    const teamPoints: RoundScore["teamPoints"] = {};
    const field = matches.filter(isScrambleFieldMatch);
    const placement = computeScramblePlacement(field, ctx, placePoints);
    const allDone = field.every((m) => computeScrambleGroupTotal(m, ctx).complete);

    for (const match of matches) {
      states[match.id] = computeMatchState(match, players, ctx);
      if (allDone && isScrambleFieldMatch(match)) {
        const teamId = match.sideA.teamId;
        teamPoints[teamId] = (teamPoints[teamId] ?? 0) + (placement.get(match.id) ?? 0);
      }
    }
    return { states, teamPoints };
  },
};
