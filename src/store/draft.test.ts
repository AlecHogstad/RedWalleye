import { describe, expect, it } from "vitest";
import { seedState } from "../data/seed";
import {
  currentPickTeam,
  picksLeftFor,
  pickTeam,
  PICKS_TOTAL,
  rosterFromDraft,
  reconcileDraftTeams,
  teamRosterIds,
  draftHasRosters,
} from "./draft";

describe("pickTeam — alternating order", () => {
  it("runs A B A B A B A B … when A picks first", () => {
    const order = Array.from({ length: 8 }, (_, i) => pickTeam(i, "tA"));
    expect(order).toEqual(["tA", "tB", "tA", "tB", "tA", "tB", "tA", "tB"]);
  });

  it("mirrors when B picks first", () => {
    const order = Array.from({ length: 4 }, (_, i) => pickTeam(i, "tB"));
    expect(order).toEqual(["tB", "tA", "tB", "tA"]);
  });

  it("gives each team exactly 7 of the 14 picks", () => {
    const teams = Array.from({ length: PICKS_TOTAL }, (_, i) => pickTeam(i, "tA"));
    expect(teams.filter((t) => t === "tA")).toHaveLength(7);
    expect(teams.filter((t) => t === "tB")).toHaveLength(7);
  });
});

describe("currentPickTeam", () => {
  it("is whoever owns the next index", () => {
    expect(currentPickTeam([], "tA")).toBe("tA");
    expect(currentPickTeam(["p0"], "tA")).toBe("tB");
    expect(currentPickTeam(["p0", "p1"], "tA")).toBe("tA");
    expect(currentPickTeam(["p0", "p1", "p2"], "tA")).toBe("tB");
  });

  it("is null once the draft is full", () => {
    const picks = Array.from({ length: PICKS_TOTAL }, (_, i) => `p${i}`);
    expect(currentPickTeam(picks, "tA")).toBeNull();
  });
});

describe("picksLeftFor", () => {
  it("counts remaining picks per team", () => {
    expect(picksLeftFor("tA", [], "tA")).toBe(7);
    expect(picksLeftFor("tB", [], "tA")).toBe(7);
    // After the first pick (A), A has 6 left, B still 7.
    expect(picksLeftFor("tA", ["p0"], "tA")).toBe(6);
    expect(picksLeftFor("tB", ["p0"], "tA")).toBe(7);
  });

  it("reaches zero when full", () => {
    const picks = Array.from({ length: PICKS_TOTAL }, (_, i) => `p${i}`);
    expect(picksLeftFor("tA", picks, "tA")).toBe(0);
    expect(picksLeftFor("tB", picks, "tA")).toBe(0);
  });
});

describe("rosterFromDraft", () => {
  it("lists captain plus alternating picks for each team", () => {
    const picks = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11", "p12", "p13", "p14"];
    const tA = rosterFromDraft("tA", picks, "tA", "capA", "capB");
    const tB = rosterFromDraft("tB", picks, "tA", "capA", "capB");
    expect(tA).toHaveLength(8);
    expect(tB).toHaveLength(8);
    expect(tA[0]).toBe("capA");
    expect(tB[0]).toBe("capB");
    expect(tA).toEqual(["capA", "p1", "p3", "p5", "p7", "p9", "p11", "p13"]);
    expect(tB).toContain("p14"); // last pick goes to B when A picks first
  });
});

describe("teamRosterIds", () => {
  it("returns empty before the draft starts", () => {
    const state = seedState();
    expect(draftHasRosters(state)).toBe(false);
    expect(teamRosterIds(state, "tA")).toEqual([]);
  });

  it("returns draft rosters once picks begin", () => {
    const state = seedState();
    state.draft = {
      status: "active",
      captainA: "hunter",
      captainB: "mike",
      firstPick: "tA",
      picks: ["nick"],
      rev: 1,
    };
    expect(draftHasRosters(state)).toBe(true);
    expect(teamRosterIds(state, "tA")).toEqual(["hunter", "nick"]);
    expect(teamRosterIds(state, "tB")).toEqual(["mike"]);
  });
});

describe("reconcileDraftTeams", () => {
  it("assigns teamId from draft picks when sync lagged", () => {
    const state = seedState();
    for (const p of state.players) p.teamId = "";
    state.draft = {
      status: "done",
      captainA: "hunter",
      captainB: "mike",
      firstPick: "tA",
      picks: ["nick"],
      rev: 1,
    };
    reconcileDraftTeams(state);
    expect(state.players.find((p) => p.id === "hunter")!.teamId).toBe("tA");
    expect(state.players.find((p) => p.id === "mike")!.teamId).toBe("tB");
    expect(state.players.find((p) => p.id === "nick")!.teamId).toBe("tA");
  });
});
