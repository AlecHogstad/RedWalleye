// Scramble — a round-wide field, not a head-to-head match. Each group enters
// one raw team ball (no handicap); all groups race the same course and the four
// 18-hole totals place 6 / 4 / 2 / 0 (ties split). A team adds up both its
// groups. Points lock only once every group has finished. Delegates to the
// engine's tested placement math.

import { FORMAT_LABELS, FORMAT_RULE_SECTIONS, FORMAT_SHORT } from "../../types";
import {
  allocateStrokes,
  computeMatchState,
  computeScrambleGroupTotal,
  computeScramblePlacement,
  isScrambleFieldMatch,
} from "../engine";
import type { FormatPlugin, RoundScore } from "./contract";

export const scramble: FormatPlugin = {
  id: "scramble",
  labels: { long: FORMAT_LABELS.scramble, short: FORMAT_SHORT.scramble },
  ruleSections: FORMAT_RULE_SECTIONS.scramble,
  scope: "field",
  sides: "group",
  seatsPerSide: 4,
  entry: "team-ball",

  allocateStrokes: (match, players, ctx) => allocateStrokes(match, players, ctx),

  scoreRound(matches, players, ctx) {
    const states: RoundScore["states"] = {};
    const teamPoints: RoundScore["teamPoints"] = {};
    const field = matches.filter(isScrambleFieldMatch);
    const placement = computeScramblePlacement(field, ctx);
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
