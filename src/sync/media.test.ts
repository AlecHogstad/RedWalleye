import { describe, expect, it } from "vitest";
import { mediaPathForEvent, mulliganStampText, publicMediaUrl } from "./media";

describe("mediaPathForEvent", () => {
  it("uses a stable rw/ prefix and jpg extension", () => {
    expect(mediaPathForEvent("a_abc123")).toBe("rw/a_abc123.jpg");
  });
});

describe("publicMediaUrl", () => {
  it("builds a public storage URL from the configured project", () => {
    const url = publicMediaUrl("rw/a_test.jpg");
    expect(url).toContain("/storage/v1/object/public/rw-media/rw/a_test.jpg");
  });
});

describe("mulliganStampText", () => {
  it("stamps player, hole, and the trip name", () => {
    expect(mulliganStampText("Hunter", 7)).toBe(
      "BOOZE MULLIGAN · HOLE 7 · HUNTER · HAYWARD INVITATIONAL",
    );
  });

  it("skips the hole when the event has none", () => {
    expect(mulliganStampText("Hunter")).toBe(
      "BOOZE MULLIGAN · HUNTER · HAYWARD INVITATIONAL",
    );
  });

  it("skips the name for an unknown player", () => {
    expect(mulliganStampText(undefined, 12)).toBe(
      "BOOZE MULLIGAN · HOLE 12 · HAYWARD INVITATIONAL",
    );
  });
});
