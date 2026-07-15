import { describe, expect, it } from "vitest";
import type { DraftState } from "../types";
import { applyRemote, kvToRemote, mergeDraftState, type RemoteData } from "./sync";
import { seedState } from "../data/seed";

describe("mergeDraftState", () => {
  const base: DraftState = {
    status: "active",
    captainA: "hunter",
    captainB: "mike",
    firstPick: "tA",
    picks: ["nick"],
  };

  it("ignores a stale row with a lower revision", () => {
    const current: DraftState = { ...base, picks: ["nick", "jay"], rev: 3 };
    const stale: DraftState = { ...base, picks: ["nick", "jay", "alec"], rev: 2 };
    expect(mergeDraftState(current, stale)).toBe(current);
  });

  it("ignores a stale row with fewer picks", () => {
    const stale: DraftState = { ...base, picks: [] };
    expect(mergeDraftState(base, stale)).toBe(base);
  });

  it("ignores a stale prefix when the draft has moved on", () => {
    const current: DraftState = { ...base, picks: ["nick", "jay", "alec"], status: "done" };
    const stale: DraftState = { ...base, picks: ["nick", "jay"], status: "active" };
    expect(mergeDraftState(current, stale)).toBe(current);
  });

  it("accepts a row with more picks", () => {
    const newer: DraftState = { ...base, picks: ["nick", "jay"] };
    expect(mergeDraftState(base, newer)).toEqual(newer);
  });

  it("accepts a done status at the same pick count", () => {
    const done: DraftState = { ...base, status: "done" };
    expect(mergeDraftState(base, done).status).toBe("done");
  });
});

describe("applyRemote", () => {
  it("returns the base unchanged for null remote", () => {
    const base = seedState();
    expect(applyRemote(base, null)).toBe(base);
  });

  it("merges scores onto the seeded matches", () => {
    const remote: RemoteData = {
      scores: { r1m1: { hunter: { h1: 5, h2: 4 }, "team:tA": { h1: 4 } } },
    };
    const state = applyRemote(seedState(), remote);
    const match = state.matches.find((m) => m.id === "r1m1")!;
    expect(match.scores.hunter[1]).toBe(5);
    expect(match.scores.hunter[2]).toBe(4);
    expect(match.scores["team:tA"][1]).toBe(4);
    // untouched entries stay empty
    expect(match.scores.frank).toEqual({});
  });

  it("applies round status, course and tee", () => {
    const remote: RemoteData = {
      rounds: { r2: { status: "active", courseId: "bigfish", teeName: "Member" } },
    };
    const state = applyRemote(seedState(), remote);
    const r2 = state.rounds.find((r) => r.id === "r2")!;
    expect(r2.status).toBe("active");
    expect(r2.courseId).toBe("bigfish");
    expect(r2.teeName).toBe("Member");
    expect(state.rounds.find((r) => r.id === "r1")!.status).toBe("pending");
  });

  it("applies player and hole edits", () => {
    const remote: RemoteData = {
      players: { jeff: { handicap: 9.2 } },
      holes: { hayward: { h6: { strokeIndex: 2 } } },
    };
    const state = applyRemote(seedState(), remote);
    expect(state.players.find((p) => p.id === "jeff")!.handicap).toBe(9.2);
    const hole6 = state.courses
      .find((c) => c.id === "hayward")!
      .holes.find((h) => h.number === 6)!;
    expect(hole6.strokeIndex).toBe(2);
    expect(hole6.par).toBe(4); // untouched field survives
  });

  it("renames a team", () => {
    const remote: RemoteData = { teams: { tA: { name: "Walleye Crushers" } } };
    const state = applyRemote(seedState(), remote);
    expect(state.teams.find((t) => t.id === "tA")!.name).toBe("Walleye Crushers");
    expect(state.teams.find((t) => t.id === "tB")!.name).toBe("Team B");
  });

  it("reassigns a player's team", () => {
    const remote: RemoteData = { players: { nick: { teamId: "" } } };
    const state = applyRemote(seedState(), remote);
    expect(state.players.find((p) => p.id === "nick")!.teamId).toBe("");
  });

  it("adds a brand-new player not in the seed", () => {
    const remote: RemoteData = {
      players: { p_new: { name: "Ringer", handicap: 4, teamId: "" } },
    };
    const state = applyRemote(seedState(), remote);
    const added = state.players.find((p) => p.id === "p_new");
    expect(added).toBeDefined();
    expect(added!.name).toBe("Ringer");
    expect(added!.handicap).toBe(4);
  });

  it("removes a seed player via a deleted tombstone", () => {
    const remote: RemoteData = { players: { hunter: { deleted: true } } };
    const state = applyRemote(seedState(), remote);
    expect(state.players.find((p) => p.id === "hunter")).toBeUndefined();
  });

  it("overrides a match's sides", () => {
    const remote: RemoteData = {
      matches: {
        r1m1: {
          sideA: { teamId: "tA", playerIds: ["hunter", "alex"] },
        },
      },
    };
    const state = applyRemote(seedState(), remote);
    const m = state.matches.find((x) => x.id === "r1m1")!;
    expect(m.sideA.playerIds).toEqual(["hunter", "alex"]);
    // sideB untouched by a sideA-only patch
    expect(m.sideB.teamId).toBe("tB");
  });

  it("merges side-game opt-ins and the snake holder", () => {
    const remote: RemoteData = {
      sideGames: {
        r1m1: { stableford: true, snake: true, snakeHolder: "hunter" },
      },
    };
    const state = applyRemote(seedState(), remote);
    expect(state.sideGames.r1m1).toEqual({
      stableford: true,
      snake: true,
      snakeHolder: "hunter",
    });
    // untouched matches have no side-game entry
    expect(state.sideGames.r1m2).toBeUndefined();
  });

  it("builds a time-sorted activity feed from event rows", () => {
    const remote: RemoteData = {
      activity: {
        a2: { id: "a2", type: "mulligan", matchId: "r2m1", playerId: "nick", ts: 200 },
        a1: { id: "a1", type: "mulligan", matchId: "r2m1", playerId: "hunter", ts: 100 },
      },
    };
    const state = applyRemote(seedState(), remote);
    expect(state.activity.map((e) => e.id)).toEqual(["a1", "a2"]);
    expect(state.activity[0].playerId).toBe("hunter");
  });

  it("applies the draft singleton", () => {
    const remote: RemoteData = {
      draft: {
        status: "active",
        captainA: "hunter",
        captainB: "mike",
        firstPick: "tA",
        picks: ["nick"],
      },
    };
    const state = applyRemote(seedState(), remote);
    expect(state.draft?.status).toBe("active");
    expect(state.draft?.picks).toEqual(["nick"]);
  });

  it("applies the House Rules singleton", () => {
    const remote: RemoteData = {
      houseRules: { formats: { fourball: { segmentValue: 2 }, scramble: { placementPoints: [8, 4, 0, 0] } } },
    };
    const state = applyRemote(seedState(), remote);
    expect(state.houseRules?.formats.fourball.segmentValue).toBe(2);
    expect(state.houseRules?.formats.scramble.placementPoints).toEqual([8, 4, 0, 0]);
  });

  it("ignores unknown ids and null leaves without crashing", () => {
    const remote = {
      scores: { ghost: { nobody: { h1: 4 } }, r1m1: { hunter: { h3: null } } },
      rounds: { ghost: { status: "active" } },
      players: { ghost: { handicap: 1 } },
      holes: { ghost: { h1: { par: 4 } } },
    } as unknown as RemoteData;
    const state = applyRemote(seedState(), remote);
    expect(state.matches.find((m) => m.id === "r1m1")!.scores.hunter[3]).toBeUndefined();
  });

  it("does not mutate the base state", () => {
    const base = seedState();
    applyRemote(base, { rounds: { r1: { status: "final" } } });
    expect(base.rounds.find((r) => r.id === "r1")!.status).toBe("pending");
  });
});

describe("kvToRemote", () => {
  const V = "rw";

  it("rebuilds the delta tree from flat rows", () => {
    const kv = new Map<string, unknown>([
      [`${V}|scores|r1m1|hunter|h3`, 5],
      [`${V}|scores|r1m1|team:t1|h1`, 4],
      [`${V}|rounds|r1`, { status: "active", courseId: "bigfish", teeName: "Member" }],
      [`${V}|players|jeff`, { handicap: 9.2 }],
      [`${V}|holes|hayward|h6`, { strokeIndex: 2 }],
      [`${V}|teams|t1`, { name: "Walleye Crushers" }],
      [`${V}|matches|r1m1`, { sideA: { teamId: "t1", playerIds: ["hunter"] } }],
      [`${V}|sidegames|r1m1`, { stableford: true, snakeHolder: "nick" }],
      [`${V}|activity|a1`, { id: "a1", type: "mulligan", matchId: "r2m1", playerId: "nick", ts: 5 }],
      [`${V}|draft|state`, { status: "done", captainA: "hunter", captainB: "mike", firstPick: "tA", picks: [] }],
      [`${V}|houserules|state`, { formats: { fourball: { segmentValue: 2 } } }],
    ]);
    const remote = kvToRemote(kv);
    expect(remote.scores?.r1m1?.hunter?.h3).toBe(5);
    expect(remote.scores?.r1m1?.["team:t1"]?.h1).toBe(4);
    expect(remote.rounds?.r1?.teeName).toBe("Member");
    expect(remote.players?.jeff?.handicap).toBe(9.2);
    expect(remote.holes?.hayward?.h6?.strokeIndex).toBe(2);
    expect(remote.teams?.t1?.name).toBe("Walleye Crushers");
    expect(remote.matches?.r1m1?.sideA?.playerIds).toEqual(["hunter"]);
    expect(remote.sideGames?.r1m1?.stableford).toBe(true);
    expect(remote.sideGames?.r1m1?.snakeHolder).toBe("nick");
    expect(remote.activity?.a1?.playerId).toBe("nick");
    expect(remote.activity?.a1?.type).toBe("mulligan");
    expect(remote.draft?.status).toBe("done");
    expect(remote.draft?.captainA).toBe("hunter");
    expect(remote.houseRules?.formats.fourball.segmentValue).toBe(2);
  });

  it("ignores rows from other seed versions and null values", () => {
    const kv = new Map<string, unknown>([
      [`v999|scores|r1m1|hunter|h3`, 8],
      [`${V}|scores|r1m1|hunter|h4`, null],
    ]);
    const remote = kvToRemote(kv);
    expect(remote.scores).toBeUndefined();
  });

  it("round-trips into applyRemote", () => {
    const kv = new Map<string, unknown>([
      [`${V}|scores|r1m1|hunter|h3`, 5],
      [`${V}|rounds|r1`, { status: "active", courseId: "hayward", teeName: "White" }],
    ]);
    const state = applyRemote(seedState(), kvToRemote(kv));
    expect(state.matches.find((m) => m.id === "r1m1")!.scores.hunter[3]).toBe(5);
    const r1 = state.rounds.find((r) => r.id === "r1")!;
    expect(r1.status).toBe("active");
    expect(r1.courseId).toBe("hayward");
  });
});
