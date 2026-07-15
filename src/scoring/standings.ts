// ---------------------------------------------------------------------------
// Tournament standings — format-agnostic roll-up.
//
// Each round is scored by its format plugin (one format per round). The plugin
// returns per-match states + team points; this loop accumulates points and the
// played/complete counts across every round. A team is credited "played" for a
// match it has a side in that has started, "complete" once that match's bet is
// locked — which reproduces the old hand-branched behaviour exactly (proven by
// the computeStandings tests), but now works for any registered format.
// ---------------------------------------------------------------------------

import type { HouseRules, Match, Player } from "../types";
import type { ScoringContext } from "./engine";
import { getFormat, resolveFormatRules } from "./formats";

export interface TeamStanding {
  teamId: string;
  points: number;
  matchesPlayed: number;
  matchesComplete: number;
}

export function computeStandings(
  matches: Match[],
  players: Player[],
  ctxByRound: Record<string, ScoringContext>,
  houseRules?: HouseRules,
): TeamStanding[] {
  const table = new Map<string, TeamStanding>();
  const ensure = (teamId: string) => {
    if (!table.has(teamId)) {
      table.set(teamId, { teamId, points: 0, matchesPlayed: 0, matchesComplete: 0 });
    }
    return table.get(teamId)!;
  };

  // Group matches by round — every match in a round shares one format.
  const byRound = new Map<string, Match[]>();
  for (const m of matches) {
    const arr = byRound.get(m.roundId);
    if (arr) arr.push(m);
    else byRound.set(m.roundId, [m]);
  }

  for (const [roundId, roundMatches] of byRound) {
    const ctx = ctxByRound[roundId];
    if (!ctx) continue;

    const format = roundMatches[0].format;
    const { states, teamPoints } = getFormat(format).scoreRound(
      roundMatches,
      players,
      ctx,
      resolveFormatRules(format, houseRules),
    );

    // Played / complete: credit each team that fields a side in a match.
    for (const match of roundMatches) {
      const st = states[match.id];
      if (!st) continue;
      for (const side of [match.sideA, match.sideB]) {
        if (side.playerIds.length === 0) continue; // field formats leave sideB empty
        const team = ensure(side.teamId);
        if (st.thru > 0) team.matchesPlayed += 1;
        if (st.complete) team.matchesComplete += 1;
      }
    }

    for (const [teamId, pts] of Object.entries(teamPoints)) {
      ensure(teamId).points += pts;
    }
  }

  return [...table.values()].sort((x, y) => y.points - x.points);
}
