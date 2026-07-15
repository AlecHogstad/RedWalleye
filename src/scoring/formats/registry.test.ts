import { describe, expect, it } from "vitest";
import type { CourseDef, Match, Player } from "../../types";
import { teamScoreKey, type ScoringContext } from "../engine";
import { FORMAT_REGISTRY, getFormat, isTeamBall, seatsPerSide } from "./index";

const course: CourseDef = {
  id: "t",
  name: "Test",
  holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 })),
  tees: [{ name: "W", yardage: 6000, rating: 72, slope: 113 }],
};
const ctx: ScoringContext = { course, tee: course.tees[0] };

describe("format registry", () => {
  it("registers every format under its own id, with sane metadata", () => {
    for (const [key, plugin] of Object.entries(FORMAT_REGISTRY)) {
      expect(plugin.id).toBe(key);
      expect(plugin.seatsPerSide).toBeGreaterThan(0);
      expect(plugin.ruleSections.length).toBeGreaterThan(0);
    }
    expect(seatsPerSide("fourball")).toBe(2);
    expect(seatsPerSide("scramble")).toBe(4);
    expect(isTeamBall("fourball")).toBe(false);
    expect(isTeamBall("scramble")).toBe(true);
    expect(getFormat("fourball").entry).toBe("per-player");
    expect(getFormat("scramble").scope).toBe("field");
  });

  it("four-ball scoreRound sums Nassau points to each side's team", () => {
    const players: Player[] = [
      { id: "a1", name: "A1", handicap: 0, teamId: "tA" },
      { id: "a2", name: "A2", handicap: 0, teamId: "tA" },
      { id: "b1", name: "B1", handicap: 0, teamId: "tB" },
      { id: "b2", name: "B2", handicap: 0, teamId: "tB" },
    ];
    const scores: Match["scores"] = { a1: {}, a2: {}, b1: {}, b2: {} };
    for (let h = 1; h <= 18; h++) {
      scores.a1[h] = 4;
      scores.a2[h] = 4;
      scores.b1[h] = 5; // A wins every hole → sweeps front, back, overall
      scores.b2[h] = 5;
    }
    const m: Match = {
      id: "r1m1",
      roundId: "r1",
      format: "fourball",
      sideA: { teamId: "tA", playerIds: ["a1", "a2"] },
      sideB: { teamId: "tB", playerIds: ["b1", "b2"] },
      scores,
    };
    const { states, teamPoints } = getFormat("fourball").scoreRound([m], players, ctx);
    expect(teamPoints.tA).toBeCloseTo(3);
    expect(teamPoints.tB ?? 0).toBeCloseTo(0);
    expect(states.r1m1.complete).toBe(true);
  });

  // A scramble group with `strokes` on every hole (18 * strokes gross).
  function group(id: string, teamId: string, strokes: number, holes = 18): Match {
    const key = teamScoreKey(teamId);
    const scores: Match["scores"] = { [key]: {} };
    for (let h = 1; h <= holes; h++) scores[key][h] = strokes;
    return {
      id,
      roundId: "r2",
      format: "scramble",
      sideA: { teamId, playerIds: ["x", "y", "z", "w"] },
      sideB: { teamId: teamId === "tA" ? "tB" : "tA", playerIds: [] },
      scores,
    };
  }

  it("scramble scoreRound places groups 6/4/2/0 (ties split) once all finish", () => {
    // Gross: tA 72 & 90, tB 72 & 108. Two tied at 72 share (6+4)/2 = 5; 90 = 2; 108 = 0.
    const matches = [
      group("r2m1", "tA", 4),
      group("r2m2", "tA", 5),
      group("r2m3", "tB", 4),
      group("r2m4", "tB", 6),
    ];
    const { teamPoints } = getFormat("scramble").scoreRound(matches, [], ctx);
    expect(teamPoints.tA).toBeCloseTo(7); // 5 + 2
    expect(teamPoints.tB).toBeCloseTo(5); // 5 + 0
  });

  it("scramble awards nothing until every group has 18 holes", () => {
    const matches = [
      group("r2m1", "tA", 4),
      group("r2m2", "tA", 5),
      group("r2m3", "tB", 4),
      group("r2m4", "tB", 6, 17), // unfinished
    ];
    const { teamPoints } = getFormat("scramble").scoreRound(matches, [], ctx);
    expect(Object.keys(teamPoints)).toHaveLength(0);
  });
});
