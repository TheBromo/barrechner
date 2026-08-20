import { describe, expect, it } from "vitest";
import { formatPrice, parsePrice } from "./format";

describe("CHF prices", () => {
  it("parses decimal comma and formats rappen", () => {
    expect(parsePrice("17,50")).toBe(1750);
    expect(formatPrice(1750)).toBe("17.50");
    expect(formatPrice(500)).toBe("5.–");
  });
  it("rejects fractions of a Rappen", () => expect(parsePrice("5.555")).toBeNaN());
});
