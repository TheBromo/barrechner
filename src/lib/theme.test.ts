import { describe, expect, it } from "vitest";
import { foregroundFor, themeVariables } from "./theme";

describe("bar themes", () => {
  it("chooses readable text", () => {
    expect(foregroundFor("#101a17")).toBe("#ffffff");
    expect(foregroundFor("#f3ba45")).toBe("#0b0d0c");
  });
  it("derives all calculator variables", () => expect(Object.keys(themeVariables("#101a17", "#f3ba45"))).toHaveLength(6));
});
