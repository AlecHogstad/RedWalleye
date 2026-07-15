// Four-ball (2-man best ball) — a head-to-head Nassau per match. Each golfer
// holes their own ball; the side's better net counts on each hole; front / back
// / overall bets pay 1 point each. Delegates to the engine's tested math.

import { FORMAT_LABELS, FORMAT_RULE_SECTIONS, FORMAT_SHORT } from "../../types";
import { allocateStrokes, computeMatchState } from "../engine";
import type { FormatPlugin, RoundScore } from "./contract";

export const fourball: FormatPlugin = {
  id: "fourball",
  labels: { long: FORMAT_LABELS.fourball, short: FORMAT_SHORT.fourball },
  ruleSections: FORMAT_RULE_SECTIONS.fourball,
  scope: "match",
  sides: "AvsB",
  seatsPerSide: 2,
  entry: "per-player",

  allocateStrokes: (match, players, ctx) => allocateStrokes(match, players, ctx),

  scoreRound(matches, players, ctx) {
    const states: RoundScore["states"] = {};
    const teamPoints: RoundScore["teamPoints"] = {};
    for (const match of matches) {
      const st = computeMatchState(match, players, ctx);
      states[match.id] = st;
      teamPoints[match.sideA.teamId] = (teamPoints[match.sideA.teamId] ?? 0) + st.points.a;
      teamPoints[match.sideB.teamId] = (teamPoints[match.sideB.teamId] ?? 0) + st.points.b;
    }
    return { states, teamPoints };
  },
};
