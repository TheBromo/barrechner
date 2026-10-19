import { describe, expect, it } from "vitest";
import { validateImportProposal } from "~/lib/bar-import";
import { detectFileType, imageDimensions } from "~/lib/files";

describe("bar-card import validation", () => {
  it("converts CHF to Rappen, supplies default labels, and generates safe IDs", () => {
    const proposal = validateImportProposal({
      categories: [{ name: "Bier", emoji: "🍺", items: [{ name: "Lager", note: "offen", variants: [{ label: "", priceChf: 5.5, uncertain: false, uncertaintyReason: "" }] }] }],
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
          { name: "Eistee", note: "", variants: [{ label: "", priceChf: 4, uncertain: true, uncertaintyReason: "" }] },
        ],
      }],
      warnings: [{ path: "x", message: "Seite 2 unscharf" }, { path: "x", message: "Seite 2 unscharf" }],
    });
    expect(proposal.categories[0].items[0].variants[0].price).toBe(500);
    expect(proposal.categories[0].items[1].variants[0].price).toBeNull();
    expect(proposal.warnings.map((warning) => warning.message)).toEqual([
      "Cola: Preis steht versetzt.",
      "Wasser: Preis muss ergänzt werden.",
      "Eistee: Preiszuordnung bitte prüfen.",
      "Seite 2 unscharf",
    ]);
  });
  it("rejects invalid structured output, emojis and sub-Rappen prices", () => {
    expect(() => validateImportProposal({ categories: [], warnings: [] })).toThrow("keine Kategorien");
    expect(() => validateImportProposal({ categories: [{ name: "Bier", emoji: "Bier", items: [{ name: "Lager", variants: [{ priceChf: 5 }] }] }] })).toThrow("ungültiger Emoji");
    expect(() => validateImportProposal({ categories: [{ name: "Bier", emoji: "🍺", items: [{ name: "Lager", variants: [{ priceChf: 5.555 }] }] }] })).toThrow("ungültiger Preis");
  });
});

function png(width: number, height: number) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

describe("file signatures", () => {
  it("detects supported file types by content", () => {
    expect(detectFileType(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(detectFileType(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))).toBe("image/jpeg");
    expect(detectFileType(png(1, 1))).toBe("image/png");
    expect(detectFileType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(detectFileType(new TextEncoder().encode("<svg xmlns=…>"))).toBeNull();
  });
  it("reads image dimensions from headers", () => {
    expect(imageDimensions(png(800, 600))).toEqual({ width: 800, height: 600 });
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x02, 0x58, 0x03, 0x00, 0x00]);
    expect(imageDimensions(jpeg)).toEqual({ width: 600, height: 300 });
    const webp = new Uint8Array(30);
    webp.set(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8X"));
    webp.set([0x1f, 0x03, 0x00, 0x57, 0x02, 0x00], 24);
    expect(imageDimensions(webp)).toEqual({ width: 800, height: 600 });
  });
});
