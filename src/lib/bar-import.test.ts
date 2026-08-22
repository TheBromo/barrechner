import { describe, expect, it } from "vitest";
import { detectImportMime, validateImportProposal } from "./bar-import";

describe("bar-card import validation", () => {
  it("converts CHF to Rappen, supplies default labels, and generates safe IDs", () => {
    const proposal = validateImportProposal({
      categories: [{
        name: "Bier",
        emoji: "🍺",
        items: [{ name: "Lager", note: "offen", variants: [{ label: "", priceChf: 5.5, uncertain: false, uncertaintyReason: "" }] }],
      }],
      warnings: [],
    });

    expect(proposal.categories[0]).toMatchObject({ name: "Bier", emoji: "🍺" });
    expect(proposal.categories[0].id).toMatch(/^cat-[a-f0-9-]+$/);
    expect(proposal.categories[0].items[0].variants[0]).toMatchObject({ label: "Standard", price: 550 });
    expect(proposal.warnings).toEqual([]);
  });

  it("retains best guesses and flags uncertain or missing prices", () => {
    const proposal = validateImportProposal({
      categories: [{
        name: "Softdrinks",
        emoji: "🥤",
        items: [
          { name: "Cola", note: "", variants: [{ label: "3 dl", priceChf: 5, uncertain: true, uncertaintyReason: "Preis steht versetzt." }] },
          { name: "Wasser", note: "", variants: [{ label: "", priceChf: null, uncertain: true, uncertaintyReason: "" }] },
        ],
      }],
      warnings: [],
    });

    expect(proposal.categories[0].items[0].variants[0].price).toBe(500);
    expect(proposal.categories[0].items[1].variants[0].price).toBeNull();
    expect(proposal.warnings.map((warning) => warning.message)).toEqual([
      "Cola: Preis steht versetzt.",
      "Wasser: Preis muss ergänzt werden.",
    ]);
  });

  it("rejects invalid structured output and emojis", () => {
    expect(() => validateImportProposal({ categories: [], warnings: [] })).toThrow("keine Kategorien");
    expect(() => validateImportProposal({
      categories: [{ name: "Bier", emoji: "Bier", items: [{ name: "Lager", variants: [{ priceChf: 5 }] }] }],
      warnings: [],
    })).toThrow("ungültiger Emoji");
  });

  it("detects supported file signatures", () => {
    expect(detectImportMime(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(detectImportMime(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))).toBe("image/jpeg");
    expect(detectImportMime(new TextEncoder().encode("not a menu"))).toBeNull();
  });
});
