import { describe, expect, it } from "vitest";
import { starterConfig } from "~/lib/seed";
import { isSingleEmoji, sanitizeBarConfig } from "~/lib/types";
import { UserError } from "~/lib/errors";

describe("bar configuration", () => {
  it("accepts and normalizes the starter", () => {
    const config = sanitizeBarConfig(starterConfig("Sommerbar"));
    expect(config.displayName).toBe("Sommerbar");
    expect(config.categories).toHaveLength(3);
    expect(config.categories[0].drinks[0].variants[0].price).toBe(500);
  });
  it("rejects unsafe images and invalid prices with user-facing errors", () => {
    expect(() => sanitizeBarConfig({ ...starterConfig(), logoUrl: "javascript:alert(1)" })).toThrow("Bildadresse");
    const config = starterConfig();
    config.categories[0].drinks[0].variants[0].price = -1;
    expect(() => sanitizeBarConfig(config)).toThrow(UserError);
    expect(() => sanitizeBarConfig(config)).toThrow("Lager, Preis 1: ungültiger Preis.");
  });
  it("rejects identifiers that would collide in an order", () => {
    const config = starterConfig();
    config.categories[1].drinks[0].id = config.categories[0].drinks[0].id;
    expect(() => sanitizeBarConfig(config)).toThrow("Doppelte Getränke-ID");
  });
  it("enforces structural limits", () => {
    expect(() => sanitizeBarConfig({ ...starterConfig(), categories: [] })).toThrow("Mindestens eine Kategorie");
    const many = starterConfig();
    many.categories = Array.from({ length: 31 }, (_, index) => ({ ...many.categories[0], id: `c${index}`, drinks: [] }));
    expect(() => sanitizeBarConfig(many)).toThrow("Maximal 30 Kategorien");
    const noPrice = starterConfig();
    noPrice.categories[0].drinks[0].variants = [];
    expect(() => sanitizeBarConfig(noPrice)).toThrow("mindestens ein Preis");
  });
  it("normalizes colours, notes, active flags and truncates long text", () => {
    const config = starterConfig();
    config.theme.accent = "#ABCDEF";
    config.displayName = `  ${"x".repeat(100)}  `;
    (config.categories[0].drinks[0] as { active?: boolean }).active = undefined;
    config.categories[0].drinks[0].note = "   ";
    const result = sanitizeBarConfig(config);
    expect(result.theme.accent).toBe("#abcdef");
    expect(result.displayName).toHaveLength(80);
    expect(result.categories[0].drinks[0].active).toBe(true);
    expect(result.categories[0].drinks[0]).not.toHaveProperty("note");
    expect(() => sanitizeBarConfig({ ...starterConfig(), theme: { background: "red", accent: "#000000" } })).toThrow("Grundfarbe");
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
    conflicting.categories[0].image = "/img/u/b/beer.webp";
    expect(() => sanitizeBarConfig(conflicting)).toThrow("entweder ein Emoji oder ein Bild");
  });
});
