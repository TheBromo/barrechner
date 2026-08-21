import { describe, expect, it } from "vitest";
import { starterConfig } from "./seed";
import { isSingleEmoji, sanitizeBarConfig } from "./types";

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
  it("accepts single emoji graphemes and normalizes legacy configs", () => {
    expect(isSingleEmoji("🍺")).toBe(true);
    expect(isSingleEmoji("👨‍👩‍👧‍👦")).toBe(true);
    expect(isSingleEmoji("🇨🇭")).toBe(true);
    expect(isSingleEmoji("Bier")).toBe(false);
    expect(isSingleEmoji("🍺🍷")).toBe(false);

    const legacy = starterConfig();
    delete (legacy as Partial<typeof legacy>).logoEmoji;
    for (const category of legacy.categories) delete (category as Partial<typeof category>).emoji;
    const normalized = sanitizeBarConfig(legacy);
    expect(normalized.logoEmoji).toBe("");
    expect(normalized.categories.every((category) => category.emoji === "")).toBe(true);
  });
  it("rejects invalid emoji and simultaneous emoji/image choices", () => {
    const invalid = starterConfig();
    invalid.logoEmoji = "not emoji";
    expect(() => sanitizeBarConfig(invalid)).toThrow("genau ein Emoji");

    const conflicting = starterConfig();
    conflicting.categories[0].image = "https://example.com/beer.webp";
    expect(() => sanitizeBarConfig(conflicting)).toThrow("entweder ein Emoji oder ein Bild");
  });
});
