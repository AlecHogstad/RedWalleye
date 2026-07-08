import { describe, expect, it } from "vitest";
import { mediaPathForEvent, publicMediaUrl } from "./media";

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
