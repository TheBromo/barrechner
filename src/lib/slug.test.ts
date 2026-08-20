import { describe, expect, it } from "vitest";
import { normalizeSlug, validateSlug } from "./slug";

describe("bar slugs", () => {
  it("normalizes Swiss display names", () => expect(normalizeSlug("  Bär & Fäscht  ")).toBe("bar-fascht"));
  it("rejects reserved and short addresses", () => {
    expect(() => validateSlug("admin")).toThrow("reserviert");
    expect(() => validateSlug("ab")).toThrow("mindestens");
  });
  it("accepts a stable tenant address", () => expect(validateSlug("sommer-bar-26")).toBe("sommer-bar-26"));
});
