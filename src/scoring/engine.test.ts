import { describe, expect, it } from "vitest";
import type { CourseDef, Match, Player } from "../types";
import {
  allocateStrokes,
  computeMatchState,
  computePlayerTotals,
  computeScramblePlacement,
  computeStableford,
  computeStandings,
  contextForRound,
  courseHandicap,
  nassauSegmentValue,
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
  { id: "nick", name: "Nick", handicap: 3, teamId: "tA" },
  { id: "hunter", name: "Hunter", handicap: 27, teamId: "tA" },
  { id: "jay", name: "Jay", handicap: 6, teamId: "tB" },
  { id: "nate", name: "Nate D", handicap: 21, teamId: "tB" },
];

/** Two scratch golfers (net = gross), one per side, for clean Nassau math. */
const scratch: Player[] = [
  { id: "a", name: "A", handicap: 0, teamId: "tA" },
  { id: "b", name: "B", handicap: 0, teamId: "tB" },
];

function duel(id: string, roundId = "r1"): Match {
  return {
    id,
    roundId,
    format: "fourball",
    sideA: { teamId: "tA", playerIds: ["a"] },
    sideB: { teamId: "tB", playerIds: ["b"] },
    scores: { a: {}, b: {} },
  };
}

describe("strokesOnHole", () => {
  it("gives one stroke to holes at or below the total", () => {
    expect(strokesOnHole(5, 1)).toBe(1);
    expect(strokesOnHole(5, 5)).toBe(1);
    expect(strokesOnHole(5, 6)).toBe(0);
  });

  it("rolls a second stroke onto the hardest holes past 18", () => {
    expect(strokesOnHole(20, 1)).toBe(2);
    expect(strokesOnHole(20, 3)).toBe(1);
  });
});

describe("courseHandicap — USGA slope/rating formula", () => {
  it("equals the rounded index on a neutral tee (slope 113, rating = par)", () => {
    expect(courseHandicap(27, ctx)).toBe(27);
    expect(courseHandicap(8.7, ctx)).toBe(9);
  });

  it("computes Big Fish Championship tees correctly", () => {
    const bigFish = seedState().courses.find((c) => c.id === "bigfish")!;
    const champ: ScoringContext = {
      course: bigFish,
      tee: bigFish.tees.find((t) => t.name === "Championship")!,
    };
    // 27 × (126/113) + (71.7 − 72) = 29.8 → 30
    expect(courseHandicap(27, champ)).toBe(30);
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
});

describe("allocateStrokes", () => {
  it("gives best-ball strokes off the lowest course handicap in the match", () => {
    const match: Match = {
      id: "m1",
      roundId: "r1",
      format: "fourball",
      sideA: { teamId: "tA", playerIds: ["hunter", "nick"] },
      sideB: { teamId: "tB", playerIds: ["nate", "jay"] },
      scores: {},
    };
    const alloc = allocateStrokes(match, players, ctx);
    // Low man is Nick (3) -> everyone relative to 3.
    expect(alloc.byPlayer.nick).toBe(0);
    expect(alloc.byPlayer.jay).toBe(3);
    expect(alloc.byPlayer.hunter).toBe(24);
  });

  it("gives the scramble both team balls zero strokes (raw score)", () => {
    const match: Match = {
      id: "s1",
      roundId: "r2",
      format: "scramble",
      sideA: { teamId: "tA", playerIds: ["hunter", "nate"] }, // high handicaps
      sideB: { teamId: "tB", playerIds: ["jay", "nick"] },
      scores: {},
    };
    const alloc = allocateStrokes(match, players, ctx);
    expect(alloc.byTeam[teamScoreKey("tA")]).toBe(0);
    expect(alloc.byTeam[teamScoreKey("tB")]).toBe(0);
  });
});

describe("nassauSegmentValue", () => {
  it("is 1 for four-ball and 2 for scramble", () => {
    expect(nassauSegmentValue("fourball")).toBe(1);
    expect(nassauSegmentValue("scramble")).toBe(2);
  });
});

describe("computeMatchState — Nassau (front / back / match)", () => {
  it("scores the three bets independently", () => {
    const m = duel("m");
    // Front 9: A wins every hole. Back 9: B wins every hole. Overall halved.
    for (let h = 1; h <= 9; h++) {
      m.scores.a[h] = 4;
      m.scores.b[h] = 5;
    }
    for (let h = 10; h <= 18; h++) {
      m.scores.a[h] = 5;
      m.scores.b[h] = 4;
    }
    const st = computeMatchState(m, scratch, ctx);
    expect(st.front.winner).toBe("A");
    expect(st.front.points).toEqual({ a: 1, b: 0 });
    expect(st.back.winner).toBe("B");
    expect(st.back.points).toEqual({ a: 0, b: 1 });
    expect(st.overall.winner).toBe("halve");
    expect(st.overall.points).toEqual({ a: 0.5, b: 0.5 });
    // Total across the three bets.
    expect(st.points).toEqual({ a: 1.5, b: 1.5 });
    expect(st.complete).toBe(true);
  });

  it("closes out the overall bet and locks the front, back still open", () => {
    const m = duel("m");
    // A wins holes 1..10 outright; 11..18 unplayed.
    for (let h = 1; h <= 10; h++) {
      m.scores.a[h] = 4;
      m.scores.b[h] = 5;
    }
    const st = computeMatchState(m, scratch, ctx);
    expect(st.front.winner).toBe("A"); // front locked (all 9 played)
    expect(st.overall.decided).toBe(true);
    expect(st.overall.resultText).toBe("10&8");
    expect(st.back.complete).toBe(false); // only hole 10 of the back played
    expect(st.back.points).toEqual({ a: 0, b: 0 });
    expect(st.points).toEqual({ a: 2, b: 0 }); // front + match, back not yet
    expect(st.complete).toBe(true);
  });

  it("respects handicap strokes when deciding a hole", () => {
    const m: Match = {
      id: "m2",
      roundId: "r1",
      format: "fourball",
      sideA: { teamId: "tA", playerIds: ["nick"] }, // scratch (low in match)
      sideB: { teamId: "tB", playerIds: ["jay"] }, // CH 6, strokes SI 1-6
      scores: { nick: { 1: 4 }, jay: { 1: 4 } },
    };
    const st = computeMatchState(m, players, ctx);
    // Hole 1 (SI 1): Jay nets 3 with his stroke, beats Nick's 4.
    expect(st.perHole[0].winner).toBe("B");
    expect(st.overall.leader).toBe("B");
  });
});

describe("computeMatchState — scramble field (stroke play)", () => {
  it("tracks gross total with no nassau points on the match", () => {
    const m: Match = {
      id: "r2m1",
      roundId: "r2",
      format: "scramble",
      sideA: { teamId: "tA", playerIds: ["a1", "a2", "a3", "a4"] },
      sideB: { teamId: "tB", playerIds: [] },
      scores: { [teamScoreKey("tA")]: {} },
    };
    for (let h = 1; h <= 18; h++) {
      m.scores[teamScoreKey("tA")][h] = 4;
    }
    const st = computeMatchState(m, scratch, ctx);
    expect(st.complete).toBe(true);
    expect(st.overall.resultText).toBe("Gross 72");
    expect(st.points).toEqual({ a: 0, b: 0 });
  });
});

function scrambleFieldGroup(
  id: string,
  teamId: string,
  gross: number,
): Match {
  const key = teamScoreKey(teamId);
  const scores: Match["scores"] = { [key]: {} };
  const base = Math.floor(gross / 18);
  const extra = gross % 18;
  for (let h = 1; h <= 18; h++) {
    scores[key][h] = base + (h <= extra ? 1 : 0);
  }
  return {
    id,
    roundId: "r2",
    format: "scramble",
    sideA: { teamId, playerIds: ["a"] },
    sideB: { teamId: teamId === "tA" ? "tB" : "tA", playerIds: [] },
    scores,
  };
}

describe("computeScramblePlacement", () => {
  it("awards 6/4/2/0 once all four foursomes finish", () => {
    const matches = [
      scrambleFieldGroup("r2m1", "tA", 72),
      scrambleFieldGroup("r2m2", "tA", 90),
      scrambleFieldGroup("r2m3", "tB", 73),
      scrambleFieldGroup("r2m4", "tB", 74),
    ];
    const placement = computeScramblePlacement(matches, ctx);
    expect(placement.get("r2m1")).toBe(6);
    expect(placement.get("r2m3")).toBe(4);
    expect(placement.get("r2m4")).toBe(2);
    expect(placement.get("r2m2")).toBe(0);
  });

  it("splits placement points when groups tie", () => {
    const matches = [
      scrambleFieldGroup("r2m1", "tA", 72),
      scrambleFieldGroup("r2m2", "tA", 72),
      scrambleFieldGroup("r2m3", "tB", 74),
      scrambleFieldGroup("r2m4", "tB", 76),
    ];
    const placement = computeScramblePlacement(matches, ctx);
    expect(placement.get("r2m1")).toBe(5); // (6+4)/2
    expect(placement.get("r2m2")).toBe(5);
    expect(placement.get("r2m3")).toBe(2);
    expect(placement.get("r2m4")).toBe(0);
  });

  it("returns zeros until every group has 18 holes", () => {
    const matches = [
      scrambleFieldGroup("r2m1", "tA", 72),
      scrambleFieldGroup("r2m2", "tA", 90),
      scrambleFieldGroup("r2m3", "tB", 73),
      scrambleFieldGroup("r2m4", "tB", 74),
    ];
    matches[3].scores[teamScoreKey("tB")] = { 1: 4 };
    const placement = computeScramblePlacement(matches, ctx);
    expect([...placement.values()].every((p) => p === 0)).toBe(true);
  });
});

describe("computeStandings — Nassau points per round", () => {
  const twoSided: Player[] = [
    { id: "a", name: "A", handicap: 0, teamId: "tA" },
    { id: "b", name: "B", handicap: 0, teamId: "tB" },
  ];

  function sweep(id: string, roundId: string, format: Match["format"]): Match {
    const scramble = format === "scramble";
    const keyA = scramble ? teamScoreKey("tA") : "a";
    const keyB = scramble ? teamScoreKey("tB") : "b";
    const scores: Match["scores"] = { [keyA]: {}, [keyB]: {} };
    for (let h = 1; h <= 18; h++) {
      scores[keyA][h] = 4; // A wins every hole
      scores[keyB][h] = 5;
    }
    return {
      id,
      roundId,
      format,
      sideA: { teamId: "tA", playerIds: ["a"] },
      sideB: { teamId: "tB", playerIds: ["b"] },
      scores,
    };
  }

  it("gives a four-ball sweep 3 points per match (front+back+match)", () => {
    const matches = [sweep("r1m1", "r1", "fourball"), sweep("r1m2", "r1", "fourball")];
    const standings = computeStandings(matches, twoSided, { r1: ctx });
    expect(standings.find((s) => s.teamId === "tA")!.points).toBe(6); // 2 × 3
    expect(standings.find((s) => s.teamId === "tB")!.points).toBe(0);
  });

  it("sums scramble placement points per team (max 12 per round)", () => {
    const matches = [
      scrambleFieldGroup("r2m1", "tA", 72),
      scrambleFieldGroup("r2m2", "tA", 90),
      scrambleFieldGroup("r2m3", "tB", 73),
      scrambleFieldGroup("r2m4", "tB", 74),
    ];
    const standings = computeStandings(matches, twoSided, { r2: ctx });
    expect(standings.find((s) => s.teamId === "tA")!.points).toBe(6);
    expect(standings.find((s) => s.teamId === "tB")!.points).toBe(6);
  });

  it("gives Round 3 (four 2-man matches) 12 points to a clean sweep (4 × 3)", () => {
    const matches = [
      sweep("r3m1", "r3", "fourball"),
      sweep("r3m2", "r3", "fourball"),
      sweep("r3m3", "r3", "fourball"),
      sweep("r3m4", "r3", "fourball"),
    ];
    const standings = computeStandings(matches, twoSided, { r3: ctx });
    expect(standings.find((s) => s.teamId === "tA")!.points).toBe(12);
  });

  it("splits a fully halved four-ball match 1.5 each", () => {
    const m = duel("m", "r1");
    for (let h = 1; h <= 18; h++) {
      m.scores.a[h] = 4;
      m.scores.b[h] = 4; // every hole halved -> every bet halved
    }
    const standings = computeStandings([m], scratch, { r1: ctx });
    expect(standings.find((s) => s.teamId === "tA")!.points).toBe(1.5);
    expect(standings.find((s) => s.teamId === "tB")!.points).toBe(1.5);
  });
});

describe("computePlayerTotals — player leaderboard", () => {
  it("sums gross and nets with the player's full course handicap", () => {
    const match: Match = {
      id: "m1",
      roundId: "r1",
      format: "fourball",
      sideA: { teamId: "tA", playerIds: ["jay"] },
      sideB: { teamId: "tB", playerIds: ["nick"] },
      scores: { jay: { 1: 5, 2: 4 }, nick: {} },
    };
    // Jay CH 6: strokes on SI 1..6 -> one each on holes 1 and 2.
    expect(computePlayerTotals(match, "jay", players, ctx)).toEqual({
      gross: 9,
      net: 7,
      thru: 2,
    });
  });

  it("uses the raw team score in a scramble (no handicap, net = gross)", () => {
    const match: Match = {
      id: "s1",
      roundId: "r2",
      format: "scramble",
      sideA: { teamId: "tA", playerIds: ["hunter", "nick"] },
      sideB: { teamId: "tB", playerIds: ["nate", "jay"] },
      scores: { [teamScoreKey("tA")]: { 1: 4 }, [teamScoreKey("tB")]: {} },
    };
    const t = computePlayerTotals(match, "hunter", players, ctx);
    expect(t).toEqual({ gross: 4, net: 4, thru: 1 });
    expect(computePlayerTotals(match, "nick", players, ctx)).toEqual(t);
  });
});

describe("stablefordPoints — standard net scale", () => {
  it("maps net-to-par to points", () => {
    expect(stablefordPoints(-2)).toBe(4);
    expect(stablefordPoints(-1)).toBe(3);
    expect(stablefordPoints(0)).toBe(2);
    expect(stablefordPoints(2)).toBe(0);
  });
});

describe("computeStableford", () => {
  it("returns an empty list for a scramble (no individual balls)", () => {
    const match: Match = {
      id: "m",
      roundId: "r2",
      format: "scramble",
      sideA: { teamId: "tA", playerIds: ["hunter", "nick"] },
      sideB: { teamId: "tB", playerIds: ["nate", "jay"] },
      scores: { [teamScoreKey("tA")]: { 1: 4 }, [teamScoreKey("tB")]: {} },
    };
    expect(computeStableford(match, players, ctx)).toEqual([]);
  });
});

describe("course seed data", () => {
  it.each([
    ["bigfish", 7231],
    ["hayward", 6678],
  ])("%s has 18 holes, par 72, valid HDCP permutation, card yardage %i", (id, totalYards) => {
    const c = seedState().courses.find((x) => x.id === id)!;
    expect(c.holes).toHaveLength(18);
    expect(c.holes.reduce((s, h) => s + h.par, 0)).toBe(72);
    const sis = c.holes.map((h) => h.strokeIndex).sort((a, b) => a - b);
    expect(sis).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    expect(c.holes.reduce((s, h) => s + (h.yards ?? 0), 0)).toBe(totalYards);
  });
});

describe("seed shape", () => {
  it("is two teams of eight with four matches per round", () => {
    const s = seedState();
    expect(s.teams).toHaveLength(2);
    for (const t of s.teams) {
      expect(s.players.filter((p) => p.teamId === t.id)).toHaveLength(8);
    }
    const nassau = s.matches.filter((m) => m.format === "fourball");
    for (const m of nassau) {
      expect(m.sideA.teamId).toBe("tA");
      expect(m.sideB.teamId).toBe("tB");
      expect(m.sideB.playerIds.length).toBeGreaterThan(0);
    }
    const scramble = s.matches.filter((m) => m.format === "scramble");
    expect(scramble).toHaveLength(4);
    for (const m of scramble) {
      expect(m.sideA.playerIds).toHaveLength(4);
      expect(m.sideB.playerIds).toHaveLength(0);
    }
    const byRound = (r: string) => s.matches.filter((m) => m.roundId === r).length;
    expect([byRound("r1"), byRound("r2"), byRound("r3")]).toEqual([4, 4, 4]);
  });
});
