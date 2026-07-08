import { describe, expect, it } from "vitest";
import type { CourseDef, Match, Player } from "../types";
import {
  allocateStrokes,
  computeMatchState,
  computePlayerTotals,
  computeStableford,
  computeStandings,
  computeStrokePlay,
  contextForRound,
  courseHandicap,
  stablefordPoints,
  strokesOnHole,
  teamScoreKey,
  type ScoringContext,
} from "./engine";
import { seedState } from "../data/seed";

// A simple par-72 course where strokeIndex === hole number keeps the math
// easy to reason about (hardest hole is #1, easiest is #18).
const course: CourseDef = {
  id: "test",
  name: "Test Links",
  holes: Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    par: 4,
    strokeIndex: i + 1,
  })),
  tees: [{ name: "White", yardage: 6000, rating: 72.0, slope: 113 }],
};

// Neutral context: slope 113 + rating == par means CH == rounded index.
const ctx: ScoringContext = { course, tee: course.tees[0] };

const players: Player[] = [
  { id: "hunter", name: "Hunter", handicap: 27, teamId: "t1" },
  { id: "nick", name: "Nick", handicap: 3, teamId: "t1" },
  { id: "nate", name: "Nate D", handicap: 21, teamId: "t2" },
  { id: "jay", name: "Jay", handicap: 6, teamId: "t2" },
];

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

describe("courseHandicap — USGA slope/rating formula", () => {
  it("falls back to rounded index without a tee", () => {
    expect(courseHandicap(8.7)).toBe(9);
    expect(courseHandicap(3)).toBe(3);
  });

  it("equals the rounded index on a neutral tee (slope 113, rating = par)", () => {
    expect(courseHandicap(27, ctx)).toBe(27);
    expect(courseHandicap(8.7, ctx)).toBe(9);
  });

  it("computes Big Fish Championship tees correctly", () => {
    // 71.7 rating / 126 slope, par 72.
    const bigFish = seedState().courses.find((c) => c.id === "bigfish")!;
    const champ: ScoringContext = {
      course: bigFish,
      tee: bigFish.tees.find((t) => t.name === "Championship")!,
    };
    // 27 × (126/113) + (71.7 − 72) = 30.106 − 0.3 = 29.8 → 30
    expect(courseHandicap(27, champ)).toBe(30);
    // 3 × (126/113) − 0.3 = 3.345 − 0.3 = 3.045 → 3
    expect(courseHandicap(3, champ)).toBe(3);
  });

  it("gives fewer strokes off shorter tees", () => {
    const bigFish = seedState().courses.find((c) => c.id === "bigfish")!;
    const chFor = (teeName: string) =>
      courseHandicap(20, {
        course: bigFish,
        tee: bigFish.tees.find((t) => t.name === teeName)!,
      });
    // 20 index: Tournament 20×134/113 + 2.1 = 25.8 → 26; Member 20×122/113 − 3.4 = 18.2 → 18
    expect(chFor("Tournament")).toBe(26);
    expect(chFor("Member")).toBe(18);
    expect(chFor("Tournament")).toBeGreaterThan(chFor("Member"));
  });
});

describe("contextForRound", () => {
  it("resolves the started round's course and tee", () => {
    const state = seedState();
    state.rounds[0] = {
      ...state.rounds[0],
      status: "active",
      courseId: "bigfish",
      teeName: "Member",
    };
    const c = contextForRound(state, "r1");
    expect(c.course.id).toBe("bigfish");
    expect(c.tee?.name).toBe("Member");
  });

  it("falls back to first course, no tee, for pending rounds", () => {
    const state = seedState();
    const c = contextForRound(state, "r2");
    expect(c.course.id).toBe("bigfish");
    expect(c.tee).toBeUndefined();
  });
});

describe("allocateStrokes (best ball)", () => {
  it("gives strokes off the lowest course handicap in the match", () => {
    const match: Match = {
      id: "m1",
      roundId: "r1",
      format: "fourball",
      sideA: { teamId: "t1", playerIds: ["hunter", "nick"] },
      sideB: { teamId: "t2", playerIds: ["nate", "jay"] },
      scores: {},
    };
    const alloc = allocateStrokes(match, players, ctx);
    // Low man is Nick (3) -> everyone relative to 3.
    expect(alloc.byPlayer.nick).toBe(0);
    expect(alloc.byPlayer.jay).toBe(3);
    expect(alloc.byPlayer.nate).toBe(18);
    expect(alloc.byPlayer.hunter).toBe(24);
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
    // A wins holes 1,2,3 outright (birdies beat Jay's stroke), halve 4..16.
    for (let h = 1; h <= 16; h++) {
      match.scores.nick[h] = h <= 3 ? 2 : 4;
      match.scores.jay[h] = 4;
    }
    const state = computeMatchState(match, players, ctx);
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
    const state = computeMatchState(match, players, ctx);
    // Jay net 3 beats Nick net 4 -> B leads.
    expect(state.leader).toBe("B");
    expect(state.margin).toBe(1);
    expect(state.resultText).toBe("1 UP thru 1");
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
    const state = computeMatchState(match, twoScratch, ctx);
    expect(state.thru).toBe(18);
    expect(state.complete).toBe(true);
    expect(state.resultText).toBe("Halved (AS)");
    expect(state.points).toEqual({ a: 0.5, b: 0.5 });
  });
});

describe("computeMatchState — four-ball stroke-play sub-result", () => {
  it("totals the best net balls and can disagree with the match result", () => {
    const match: Match = {
      id: "sp1",
      roundId: "r1",
      format: "fourball",
      sideA: { teamId: "t1", playerIds: ["nick"] }, // scratch
      sideB: { teamId: "t2", playerIds: ["jay"] }, // CH 6, strokes SI 1-6
      scores: {
        nick: { 1: 4, 2: 2 },
        jay: { 1: 4, 2: 5 },
      },
    };
    // Hole 1 (SI 1): Nick net 4, Jay net 3 (stroke) -> B wins the hole.
    // Hole 2 (SI 2): Nick net 2, Jay net 4 (stroke) -> A wins the hole.
    // Match is all square, but on strokes A totals 6 vs B's 7 -> A wins.
    const state = computeMatchState(match, players, ctx);
    expect(state.margin).toBe(0); // holes split
    expect(state.strokePlay).toEqual({ netA: 6, netB: 7, thru: 2, winner: "A" });
  });
});

describe("computeStrokePlay — scramble (raw team ball, no handicap)", () => {
  // High-handicap players to prove their handicaps are ignored entirely.
  const teamPlayers: Player[] = [
    { id: "a1", name: "A1", handicap: 20, teamId: "tA" },
    { id: "a2", name: "A2", handicap: 20, teamId: "tA" },
  ];
  const entry = (): Match => ({
    id: "s-tA",
    roundId: "r2",
    format: "scramble",
    sideA: { teamId: "tA", playerIds: ["a1", "a2"] },
    sideB: { teamId: "", playerIds: [] },
    scores: { [teamScoreKey("tA")]: {} },
  });

  it("gives the team no strokes regardless of handicap", () => {
    const alloc = allocateStrokes(entry(), teamPlayers, ctx);
    expect(alloc.byTeam[teamScoreKey("tA")]).toBe(0);
  });

  it("scores the team ball as gross to par", () => {
    const e = entry();
    e.scores[teamScoreKey("tA")][1] = 5; // par 4 -> +1
    e.scores[teamScoreKey("tA")][2] = 3; // par 4 -> -1
    const st = computeStrokePlay(e, teamPlayers, ctx);
    expect(st.thru).toBe(2);
    expect(st.netTotal).toBe(8); // 5 + 3, no strokes taken off
    expect(st.toPar).toBe(0);
    expect(st.toParText).toBe("E");
  });
});

describe("computeStandings", () => {
  it("totals points across matches using each round's context", () => {
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
    const standings = computeStandings([match], scratch, { r1: ctx });
    const t1 = standings.find((s) => s.teamId === "t1")!;
    const t2 = standings.find((s) => s.teamId === "t2")!;
    expect(t1.points).toBe(1);
    expect(t2.points).toBe(0);
    expect(t1.matchesComplete).toBe(1);
  });
});

describe("computeStrokePlay — 4-man team stroke play", () => {
  // Team of Hunter (24 strokes off field-low Nick) and Nick (0).
  const entry: Match = {
    id: "r3t1",
    roundId: "r3",
    format: "fourman",
    sideA: { teamId: "t1", playerIds: ["hunter", "nick"] },
    sideB: { teamId: "", playerIds: [] },
    scores: { hunter: {}, nick: {} },
  };

  it("gives fourman strokes off the whole field's low handicap", () => {
    const alloc = allocateStrokes(entry, players, ctx);
    // Field includes Nick (3): Hunter 27-3=24, Nick 0. Jay/Nate not in the
    // entry but the low pool is the field.
    expect(alloc.byPlayer.hunter).toBe(24);
    expect(alloc.byPlayer.nick).toBe(0);
  });

  it("counts the best net ball per hole and totals to par", () => {
    const e = structuredClone(entry);
    // Hole 1 (SI 1, par 4): Hunter gross 5 with 2 strokes (24 -> 2 on SI 1)
    // = net 3; Nick gross 4 = net 4. Best = 3 (birdie).
    e.scores.hunter[1] = 5;
    e.scores.nick[1] = 4;
    // Hole 18 (SI 18, par 4): Hunter 24 strokes -> 1 on SI 18; gross 6 = net 5;
    // Nick gross 5 = net 5. Best = 5 (bogey).
    e.scores.hunter[18] = 6;
    e.scores.nick[18] = 5;
    const st = computeStrokePlay(e, players, ctx);
    expect(st.thru).toBe(2);
    expect(st.netTotal).toBe(8);
    expect(st.toPar).toBe(0);
    expect(st.toParText).toBe("E");
    expect(st.complete).toBe(false);
  });

  it("completes at 18 holes", () => {
    const e = structuredClone(entry);
    for (let h = 1; h <= 18; h++) e.scores.nick[h] = 4; // even par gross
    const st = computeStrokePlay(e, players, ctx);
    expect(st.complete).toBe(true);
    expect(st.toParText).toBe("E");
  });
});

describe("computeStandings — stroke-play round points", () => {
  const twoTeams: Player[] = [
    { id: "p1", name: "P1", handicap: 0, teamId: "t1" },
    { id: "p2", name: "P2", handicap: 0, teamId: "t2" },
  ];
  const entryFor = (id: string, teamId: string, playerId: string): Match => ({
    id,
    roundId: "r3",
    format: "fourman",
    sideA: { teamId, playerIds: [playerId] },
    sideB: { teamId: "", playerIds: [] },
    scores: { [playerId]: {} },
  });

  it("awards 2 points to the low team once every team finishes", () => {
    const e1 = entryFor("e1", "t1", "p1");
    const e2 = entryFor("e2", "t2", "p2");
    for (let h = 1; h <= 18; h++) {
      e1.scores.p1[h] = 4; // E
      e2.scores.p2[h] = 5; // +18
    }
    const standings = computeStandings([e1, e2], twoTeams, { r3: ctx });
    expect(standings.find((s) => s.teamId === "t1")!.points).toBe(2);
    expect(standings.find((s) => s.teamId === "t2")!.points).toBe(0);
  });

  it("splits the 2 points on a tie", () => {
    const e1 = entryFor("e1", "t1", "p1");
    const e2 = entryFor("e2", "t2", "p2");
    for (let h = 1; h <= 18; h++) {
      e1.scores.p1[h] = 4;
      e2.scores.p2[h] = 4;
    }
    const standings = computeStandings([e1, e2], twoTeams, { r3: ctx });
    expect(standings.find((s) => s.teamId === "t1")!.points).toBe(1);
    expect(standings.find((s) => s.teamId === "t2")!.points).toBe(1);
  });

  it("awards nothing while any team is still on the course", () => {
    const e1 = entryFor("e1", "t1", "p1");
    const e2 = entryFor("e2", "t2", "p2");
    for (let h = 1; h <= 18; h++) e1.scores.p1[h] = 4;
    e2.scores.p2[1] = 4; // t2 thru 1
    const standings = computeStandings([e1, e2], twoTeams, { r3: ctx });
    expect(standings.every((s) => s.points === 0)).toBe(true);
    expect(standings.find((s) => s.teamId === "t2")!.matchesPlayed).toBe(1);
  });
});

describe("computeStandings — scramble placement points", () => {
  // Four scratch teams (2 players each, handicap 0) so team strokes are 0 and
  // net-to-par is just the team scramble ball to par.
  const fourTeams: Player[] = ["t1", "t2", "t3", "t4"].flatMap((teamId) => [
    { id: `${teamId}a`, name: `${teamId}a`, handicap: 0, teamId },
    { id: `${teamId}b`, name: `${teamId}b`, handicap: 0, teamId },
  ]);
  // Team entry whose scramble ball totals (72 + delta): flat par with hole 1
  // adjusted so the round finishes `delta` off par.
  const entry = (teamId: string, hole1: number): Match => {
    const key = teamScoreKey(teamId);
    const scores: Record<string, Record<number, number>> = { [key]: {} };
    for (let h = 1; h <= 18; h++) scores[key][h] = 4;
    scores[key][1] = hole1;
    return {
      id: `r2${teamId}`,
      roundId: "r2",
      format: "scramble",
      sideA: { teamId, playerIds: [`${teamId}a`, `${teamId}b`] },
      sideB: { teamId: "", playerIds: [] },
      scores,
    };
  };

  it("awards 3 / 1 / 0 / 0 by finish once every team is in", () => {
    const entries = [
      entry("t1", 2), // 70, -2  -> 1st
      entry("t2", 4), // 72,  E  -> 2nd
      entry("t3", 6), // 74, +2  -> 3rd
      entry("t4", 8), // 76, +4  -> 4th
    ];
    const standings = computeStandings(entries, fourTeams, { r2: ctx });
    const pts = (id: string) => standings.find((s) => s.teamId === id)!.points;
    expect(pts("t1")).toBe(3);
    expect(pts("t2")).toBe(1);
    expect(pts("t3")).toBe(0);
    expect(pts("t4")).toBe(0);
  });

  it("pools and splits the placement points on a tie for first", () => {
    const entries = [
      entry("t1", 2), // -2, tied 1st
      entry("t2", 2), // -2, tied 1st
      entry("t3", 6), // +2
      entry("t4", 8), // +4
    ];
    const standings = computeStandings(entries, fourTeams, { r2: ctx });
    const pts = (id: string) => standings.find((s) => s.teamId === id)!.points;
    // Positions 1 & 2 pool 3 + 1 = 4, split -> 2 each.
    expect(pts("t1")).toBe(2);
    expect(pts("t2")).toBe(2);
    expect(pts("t3")).toBe(0);
    expect(pts("t4")).toBe(0);
  });

  it("awards nothing while any team is still on the course", () => {
    const entries = [entry("t1", 2), entry("t2", 4), entry("t3", 6), entry("t4", 8)];
    // Knock t4 back to an unfinished card.
    delete entries[3].scores[teamScoreKey("t4")][18];
    const standings = computeStandings(entries, fourTeams, { r2: ctx });
    expect(standings.every((s) => s.points === 0)).toBe(true);
  });
});

describe("computePlayerTotals — player leaderboard", () => {
  it("sums gross and nets with the player's full course handicap", () => {
    const match: Match = {
      id: "m1",
      roundId: "r1",
      format: "fourball",
      sideA: { teamId: "t1", playerIds: ["jay"] },
      sideB: { teamId: "t2", playerIds: ["nick"] },
      scores: { jay: { 1: 5, 2: 4 }, nick: {} },
    };
    // Jay CH 6 (neutral tee): strokes on SI 1..6 -> one each on holes 1 and 2.
    const t = computePlayerTotals(match, "jay", players, ctx);
    expect(t).toEqual({ gross: 9, net: 7, thru: 2 });
    // Nick has no scores -> null.
    expect(computePlayerTotals(match, "nick", players, ctx)).toBeNull();
  });

  it("uses the raw team score in a scramble (no handicap, net = gross)", () => {
    const match: Match = {
      id: "s1",
      roundId: "r2",
      format: "scramble",
      sideA: { teamId: "t1", playerIds: ["hunter", "nick"] },
      sideB: { teamId: "t2", playerIds: ["nate", "jay"] },
      scores: { [teamScoreKey("t1")]: { 1: 4 }, [teamScoreKey("t2")]: {} },
    };
    // No strokes given -> net equals the raw team score.
    const t = computePlayerTotals(match, "hunter", players, ctx);
    expect(t).toEqual({ gross: 4, net: 4, thru: 1 });
    // Same value for the teammate.
    expect(computePlayerTotals(match, "nick", players, ctx)).toEqual(t);
  });
});

describe("course seed data", () => {
  it.each([
    ["bigfish", 7231], // hole yardages on the card = Tournament tees
    ["hayward", 6678], // hole yardages on the card = Black tees
  ])("%s has 18 holes, par 72, valid HDCP permutation, card yardage %i", (id, totalYards) => {
    const c = seedState().courses.find((x) => x.id === id)!;
    expect(c.holes).toHaveLength(18);
    expect(c.holes.reduce((s, h) => s + h.par, 0)).toBe(72);
    const sis = c.holes.map((h) => h.strokeIndex).sort((a, b) => a - b);
    expect(sis).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    expect(c.tees).toHaveLength(5);
    expect(c.holes.reduce((s, h) => s + (h.yards ?? 0), 0)).toBe(totalYards);
  });

  it("computes Hayward White-tee course handicaps", () => {
    const hayward = seedState().courses.find((c) => c.id === "hayward")!;
    const white: ScoringContext = {
      course: hayward,
      tee: hayward.tees.find((t) => t.name === "White")!,
    };
    // 69.2 rating / 121 slope, par 72.
    // 27 × (121/113) + (69.2 − 72) = 28.91 − 2.8 = 26.1 → 26
    expect(courseHandicap(27, white)).toBe(26);
    // 3 × (121/113) − 2.8 = 3.21 − 2.8 = 0.41 → 0
    expect(courseHandicap(3, white)).toBe(0);
  });
});

describe("stablefordPoints — standard net scale", () => {
  it("maps net-to-par to points", () => {
    expect(stablefordPoints(-3)).toBe(5); // albatross+
    expect(stablefordPoints(-2)).toBe(4); // eagle
    expect(stablefordPoints(-1)).toBe(3); // birdie
    expect(stablefordPoints(0)).toBe(2); // par
    expect(stablefordPoints(1)).toBe(1); // bogey
    expect(stablefordPoints(2)).toBe(0); // double or worse
    expect(stablefordPoints(5)).toBe(0);
  });
});

describe("computeStableford", () => {
  it("scores net points per player, sorted, and caps blow-ups at 0", () => {
    const match: Match = {
      id: "m",
      roundId: "r1",
      format: "fourball",
      sideA: { teamId: "t1", playerIds: ["nick"] }, // CH 3, strokes SI 1-3
      sideB: { teamId: "t2", playerIds: ["jay"] }, // CH 6, strokes SI 1-6
      scores: {
        nick: { 1: 4, 2: 6, 3: 4 }, // net 3,5,3 -> -1,+1,-1 -> 3+1+3 = 7
        jay: { 1: 4, 2: 4, 3: 8 }, // net 3,3,7 -> -1,-1,+3 -> 3+3+0 = 6
      },
    };
    const rows = computeStableford(match, players, ctx);
    expect(rows).toEqual([
      { playerId: "nick", points: 7, thru: 3 },
      { playerId: "jay", points: 6, thru: 3 },
    ]);
  });

  it("returns an empty list for a scramble (no individual balls)", () => {
    const match: Match = {
      id: "m",
      roundId: "r2",
      format: "scramble",
      sideA: { teamId: "t1", playerIds: ["hunter", "nick"] },
      sideB: { teamId: "t2", playerIds: ["nate", "jay"] },
      scores: { [teamScoreKey("t1")]: { 1: 4 }, [teamScoreKey("t2")]: {} },
    };
    expect(computeStableford(match, players, ctx)).toEqual([]);
  });

  it("counts a player with no scores as 0 points thru 0", () => {
    const match: Match = {
      id: "m",
      roundId: "r1",
      format: "fourball",
      sideA: { teamId: "t1", playerIds: ["nick"] },
      sideB: { teamId: "t2", playerIds: ["jay"] },
      scores: { nick: { 1: 4 }, jay: {} },
    };
    const rows = computeStableford(match, players, ctx);
    expect(rows.find((r) => r.playerId === "jay")).toEqual({
      playerId: "jay",
      points: 0,
      thru: 0,
    });
  });
});
