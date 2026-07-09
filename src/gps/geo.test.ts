import { describe, it, expect } from "vitest";
import { metersBetween, yardsBetween, metersToYards, bearingBetween } from "./geo";

describe("metersBetween", () => {
  it("is zero for the same point", () => {
    expect(metersBetween({ lat: 45.9, lng: -91.4 }, { lat: 45.9, lng: -91.4 })).toBe(0);
  });

  it("measures one degree of latitude at ~111.2 km", () => {
    const d = metersBetween({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    // mean-radius meridian degree ≈ 111,195 m
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });

  it("is symmetric", () => {
    const a = { lat: 45.92, lng: -91.48 };
    const b = { lat: 45.93, lng: -91.46 };
    expect(metersBetween(a, b)).toBeCloseTo(metersBetween(b, a), 6);
  });

  it("measures a short golf-scale hop within a yard of the manual calc", () => {
    // ~150 yds north at 46°N: 150 yd = 137.16 m ≈ 0.001233° latitude
    const a = { lat: 46.0, lng: -91.5 };
    const b = { lat: 46.0 + 137.16 / 111_195, lng: -91.5 };
    expect(yardsBetween(a, b)).toBe(150);
  });
});

describe("metersToYards", () => {
  it("converts meters to whole yards", () => {
    expect(metersToYards(0)).toBe(0);
    expect(metersToYards(0.9144)).toBe(1);
    expect(metersToYards(137.16)).toBe(150);
  });
});

describe("bearingBetween", () => {
  const origin = { lat: 46.0, lng: -91.5 };

  it("points ~north when the target is due north", () => {
    const b = bearingBetween(origin, { lat: 46.01, lng: -91.5 });
    expect(b).toBeCloseTo(0, 1);
  });

  it("points ~east when the target is due east", () => {
    const b = bearingBetween(origin, { lat: 46.0, lng: -91.49 });
    expect(b).toBeGreaterThan(89);
    expect(b).toBeLessThan(91);
  });

  it("returns a value in [0, 360)", () => {
    const b = bearingBetween(origin, { lat: 45.99, lng: -91.51 });
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });
});
