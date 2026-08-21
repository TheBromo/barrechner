import { describe, expect, it } from "vitest";
import { contrastRatio, foregroundFor, readableColor, themeVariables } from "./theme";

describe("bar themes", () => {
  it("chooses readable text", () => {
    expect(foregroundFor("#101a17")).toBe("#ffffff");
    expect(foregroundFor("#f3ba45")).toBe("#000000");
    expect(contrastRatio(foregroundFor("#777777"), "#777777")).toBeGreaterThanOrEqual(4.5);
  });
  it("adjusts an accent only when it needs more contrast", () => {
    expect(readableColor("#ffffff", ["#000000"])).toBe("#ffffff");
    expect(contrastRatio(readableColor("#777777", ["#777777"]), "#777777")).toBeGreaterThanOrEqual(4.5);
  });
  it.each([
    ["#000000", "#000000"],
    ["#ffffff", "#ffffff"],
    ["#777777", "#777777"],
    ["#101a17", "#18231f"],
    ["#f6f0df", "#eee8d8"],
  ])("derives readable calculator variables for %s / %s", (background, accent) => {
    const variables = themeVariables(background, accent);
    const surfaces = [variables["--bar-bg"], variables["--bar-surface"], variables["--bar-surface-strong"]];
    for (const surface of surfaces) {
      expect(contrastRatio(variables["--bar-text"], surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(variables["--bar-muted"], surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(variables["--bar-accent-ink"], surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(variables["--bar-border"], surface)).toBeGreaterThanOrEqual(3);
    }
    expect(contrastRatio(variables["--bar-accent-text"], variables["--bar-accent"])).toBeGreaterThanOrEqual(4.5);
  });
});
