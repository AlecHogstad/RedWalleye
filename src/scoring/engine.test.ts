import { describe, expect, it } from "vitest";
import type { Course, Match, Player } from "../types";
import {
  allocateStrokes,
  computeMatchState,
  computeStandings,
  courseHandicap,
  scrambleTeamHandicap,
  strokesOnHole,
  teamScoreKey,
} from "./engine";

// A simple par-72 course where strokeIndex === hole number keeps the math
// easy to reason about (hardest hole is #1, easiest is #18).
const course: Course = {
  name: "Test Links",
  holes: Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    par: 4,
    strokeIndex: i + 1,
  })),
};

const players: Player[] = [
  { id: "hunter", name: "Hunter", handicap: 27, teamId: "t1" },
  { id: "nick", name: "Nick", handicap: 3, teamId: "t1" },
  { id: "nate", name: "Nate D", handicap: 21, teamId: "t2" },
  { id: "jay", name: "Jay", handicap: 6, teamId: "t2" },
];

function blankScores(match: Match) {
  return match;
}

describe("strokesOnHole", () => {
  it("gives one stroke to holes at or below the total", () => {
    expect(strokesOnHole(5, 1)).toBe(1);
    expect(strokesOnHole(5, 5)).toBe(1);
    expect(strokesOnHole(5, 6)).toBe(0);
  });

  it("gives zero for a scratch allocation", () => {
    expect(strokesOnHole(0, 1)).toBe(0);
  });

  it("rolls a second stroke onto the hardest holes past 18", () => {
    expect(strokesOnHole(20, 1)).toBe(2);
    expect(strokesOnHole(20, 2)).toBe(2);
    expect(strokesOnHole(20, 3)).toBe(1);
    expect(strokesOnHole(20, 18)).toBe(1);
  });
});

describe("courseHandicap", () => {
  it("rounds fractional handicaps", () => {
    expect(courseHandicap(8.7)).toBe(9);
    expect(courseHandicap(3)).toBe(3);
  });
});

describe("allocateStrokes (best ball)", () => {
  it("gives strokes off the lowest player in the match", () => {
    const match: Match = {
      id: "m1",
      roundId: "r1",
      format: "fourball",
      sideA: { teamId: "t1", playerIds: ["hunter", "nick"] },
      sideB: { teamId: "t2", playerIds: ["nate", "jay"] },
      scores: {},
    };
    const alloc = allocateStrokes(match, players);
    // Low man is Nick (3) -> everyone relative to 3.
    expect(alloc.byPlayer.nick).toBe(0);
    expect(alloc.byPlayer.jay).toBe(3);
    expect(alloc.byPlayer.nate).toBe(18);
    expect(alloc.byPlayer.hunter).toBe(24);
  });
});

describe("scrambleTeamHandicap", () => {
  it("applies 35/15 for a 2-man team", () => {
    // low 3, high 27 -> 0.35*3 + 0.15*27 = 1.05 + 4.05 = 5.1 -> 5
    expect(scrambleTeamHandicap([27, 3])).toBe(5);
  });

  it("applies 25/20/15/10 for a 4-man team", () => {
    // sorted 3,6,21,27 -> .25*3 + .2*6 + .15*21 + .1*27 = .75+1.2+3.15+2.7 = 7.8 -> 8
    expect(scrambleTeamHandicap([27, 3, 21, 6])).toBe(8);
  });
});

describe("computeMatchState — four-ball match play", () => {
  it("closes out a match as 3&2", () => {
    const match: Match = {
      id: "m1",
      roundId: "r1",
      format: "fourball",
      sideA: { teamId: "t1", playerIds: ["nick"] },
      sideB: { teamId: "t2", playerIds: ["jay"] },
      scores: { nick: {}, jay: {} },
    };
    // Nick is scratch, Jay gets strokes on holes 1..3. To isolate match play,
    // make holes 4..16 count on gross where Nick wins 4 with 12 to play... we
    // want A up by 4 with 2 to play at thru 16 -> "4&2". Simpler: win holes
    // 4-16 pattern. Let's just drive a clean 3&2:
    // A wins holes 1,2,3 (net), halve the rest through 16.
    for (let h = 1; h <= 16; h++) {
      // gross 4 each; Jay gets a stroke on 1..3 so Jay would be LOWER there.
      // Instead give Nick birdies on 1..3 to win outright regardless.
      match.scores.nick[h] = h <= 3 ? 2 : 4;
      match.scores.jay[h] = 4;
    }
    const state = computeMatchState(match, players, course);
    // Jay's stroke on holes 1-3 makes his net 3 vs Nick net 2 -> A still wins.
    expect(state.leader).toBe("A");
    expect(state.margin).toBe(3);
    expect(state.thru).toBe(16);
    expect(state.decided).toBe(true);
    expect(state.resultText).toBe("3&2");
    expect(state.points).toEqual({ a: 1, b: 0 });
  });

  it("respects handicap strokes when deciding a hole", () => {
    const match: Match = {
      id: "m2",
      roundId: "r1",
      format: "fourball",
      sideA: { teamId: "t1", playerIds: ["nick"] }, // scratch
      sideB: { teamId: "t2", playerIds: ["jay"] }, // 3 strokes, holes 1-3
      scores: {
        nick: { 1: 4 },
        jay: { 1: 4 }, // gross tie, but Jay gets a stroke on hole 1 (SI 1)
      },
    };
    const state = computeMatchState(match, players, course);
    // Jay net 3 beats Nick net 4 -> B leads.
    expect(state.leader).toBe("B");
    expect(state.margin).toBe(1);
    expect(state.resultText).toBe("1 UP thru 1");
  });

  it("reports all square while in progress", () => {
    const match: Match = {
      id: "m3",
      roundId: "r1",
      format: "fourball",
      sideA: { teamId: "t1", playerIds: ["nick"] },
      sideB: { teamId: "t2", playerIds: ["nick"] },
      scores: { nick: { 5: 4 } },
    };
    const state = computeMatchState(blankScores(match), players, course);
    expect(state.resultText).toBe("AS thru 1");
    expect(state.complete).toBe(false);
  });

  it("halves a completed match that finishes level", () => {
    const match: Match = {
      id: "m4",
      roundId: "r1",
      format: "fourball",
      sideA: { teamId: "t1", playerIds: ["nick"] },
      sideB: { teamId: "t2", playerIds: ["nick2"] },
      scores: { nick: {}, nick2: {} },
    };
    const twoScratch: Player[] = [
      { id: "nick", name: "Nick", handicap: 3, teamId: "t1" },
      { id: "nick2", name: "Nick2", handicap: 3, teamId: "t2" },
    ];
    for (let h = 1; h <= 18; h++) {
      match.scores.nick[h] = 4;
      match.scores.nick2[h] = 4;
    }
    const state = computeMatchState(match, twoScratch, course);
    expect(state.thru).toBe(18);
    expect(state.complete).toBe(true);
    expect(state.resultText).toBe("Halved (AS)");
    expect(state.points).toEqual({ a: 0.5, b: 0.5 });
  });
});

describe("computeMatchState — scramble", () => {
  it("gives the higher team match strokes off the lower team", () => {
    const teamPlayers: Player[] = [
      { id: "a1", name: "A1", handicap: 20, teamId: "tA" },
      { id: "a2", name: "A2", handicap: 20, teamId: "tA" },
      { id: "b1", name: "B1", handicap: 2, teamId: "tB" },
      { id: "b2", name: "B2", handicap: 2, teamId: "tB" },
    ];
    const match: Match = {
      id: "s1",
      roundId: "r2",
      format: "scramble",
      sideA: { teamId: "tA", playerIds: ["a1", "a2"] },
      sideB: { teamId: "tB", playerIds: ["b1", "b2"] },
      scores: {
        [teamScoreKey("tA")]: { 1: 4 },
        [teamScoreKey("tB")]: { 1: 4 },
      },
    };
    // Team A scramble hcp: .35*20+.15*20 = 10; Team B: .35*2+.15*2 = 1.
    // Difference 9 -> Team A gets strokes on SI 1..9. Hole 1 has SI 1.
    const alloc = allocateStrokes(match, teamPlayers);
    expect(alloc.byTeam[teamScoreKey("tA")]).toBe(9);
    expect(alloc.byTeam[teamScoreKey("tB")]).toBe(0);
    const state = computeMatchState(match, teamPlayers, course);
    // A net 3 vs B net 4 -> A wins the hole.
    expect(state.leader).toBe("A");
    expect(state.margin).toBe(1);
  });
});

describe("computeStandings", () => {
  it("totals points across matches", () => {
    const scratch: Player[] = [
      { id: "p1", name: "P1", handicap: 0, teamId: "t1" },
      { id: "p2", name: "P2", handicap: 0, teamId: "t2" },
    ];
    const match: Match = {
      id: "m1",
      roundId: "r1",
      format: "fourball",
      sideA: { teamId: "t1", playerIds: ["p1"] },
      sideB: { teamId: "t2", playerIds: ["p2"] },
      scores: { p1: {}, p2: {} },
    };
    for (let h = 1; h <= 18; h++) {
      match.scores.p1[h] = 3; // birdies every hole
      match.scores.p2[h] = 4;
    }
    const standings = computeStandings([match], scratch, course);
    const t1 = standings.find((s) => s.teamId === "t1")!;
    const t2 = standings.find((s) => s.teamId === "t2")!;
    expect(t1.points).toBe(1);
    expect(t2.points).toBe(0);
    expect(t1.matchesComplete).toBe(1);
  });
});
