import { describe, expect, it } from "vitest";
import { currentPickTeam, picksLeftFor, pickTeam, PICKS_TOTAL } from "./draft";

describe("pickTeam — snake order", () => {
  it("runs A B B A A B B A … when A picks first", () => {
    const order = Array.from({ length: 8 }, (_, i) => pickTeam(i, "tA"));
    expect(order).toEqual(["tA", "tB", "tB", "tA", "tA", "tB", "tB", "tA"]);
  });

  it("mirrors when B picks first", () => {
    const order = Array.from({ length: 4 }, (_, i) => pickTeam(i, "tB"));
    expect(order).toEqual(["tB", "tA", "tA", "tB"]);
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
    expect(currentPickTeam(["p0", "p1"], "tA")).toBe("tB");
    expect(currentPickTeam(["p0", "p1", "p2"], "tA")).toBe("tA");
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
