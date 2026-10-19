import { describe, expect, it } from "vitest";
import { safeNextPath } from "./redirect";

describe("post-login redirect targets", () => {
  it("keeps same-origin paths with query strings", () => {
    expect(safeNextPath("/passwort-neu")).toBe("/passwort-neu");
    expect(safeNextPath("/dashboard/bars/1?tab=karte")).toBe("/dashboard/bars/1?tab=karte");
  });

  it.each(["//evil.com", "/\\evil.com", "/\\/evil.com", "https://evil.com", "evil.com", "", null])("rejects %s", (value) => {
    expect(safeNextPath(value)).toBe("/dashboard");
  });
});
