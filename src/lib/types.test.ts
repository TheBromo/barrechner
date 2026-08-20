import { describe, expect, it } from "vitest";
import { starterConfig } from "./seed";
import { sanitizeBarConfig } from "./types";

describe("bar configuration", () => {
  it("accepts and normalizes the starter", () => {
    const config = sanitizeBarConfig(starterConfig("Sommerbar"));
    expect(config.displayName).toBe("Sommerbar");
    expect(config.categories).toHaveLength(3);
    expect(config.categories[0].drinks[0].variants[0].price).toBe(500);
  });
  it("rejects unsafe images and invalid prices", () => {
    expect(() => sanitizeBarConfig({ ...starterConfig(), logoUrl: "javascript:alert(1)" })).toThrow("Bildadresse");
    const config = starterConfig();
    config.categories[0].drinks[0].variants[0].price = -1;
    expect(() => sanitizeBarConfig(config)).toThrow("ungültiger Preis");
  });
  it("rejects identifiers that would collide in an order", () => {
    const config = starterConfig();
    config.categories[1].drinks[0].id = config.categories[0].drinks[0].id;
    expect(() => sanitizeBarConfig(config)).toThrow("Doppelte Getränke-ID");
  });
});
