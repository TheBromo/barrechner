import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { importBarCard } from "./mistral-import";

describe("Mistral bar-card pipeline", () => {
  beforeEach(() => { process.env.MISTRAL_API_KEY = "test-key"; });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.MISTRAL_API_KEY; });

  it("passes OCR structure to the classifier and validates its structured response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ pages: [{ markdown: "# Bier\nLager 5.00", blocks: [{ type: "title", content: "Bier" }] }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        categories: [{ name: "Bier", emoji: "🍺", items: [{ name: "Lager", note: "", variants: [{ label: "Standard", priceChf: 5, uncertain: false, uncertaintyReason: "" }] }] }],
        warnings: [],
      }) } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const proposal = await importBarCard("https://example.com/card.pdf", "application/pdf");

    expect(proposal.categories[0].name).toBe("Bier");
    expect(proposal.categories[0].items[0].variants[0].price).toBe(500);
    const classifierBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(classifierBody.model).toBe("mistral-small-latest");
    expect(classifierBody.response_format.type).toBe("json_schema");
    expect(classifierBody.messages[1].content).toContain("# Bier");
  });

  it("rejects documents with more than twenty returned pages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      pages: Array.from({ length: 21 }, (_, index) => ({ index, markdown: `Seite ${index + 1}` })),
    }), { status: 200 })));

    await expect(importBarCard("https://example.com/large.pdf", "application/pdf")).rejects.toThrow("höchstens 20 Seiten");
  });
});
