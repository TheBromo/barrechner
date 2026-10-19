import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestD1 } from "../d1";
import { createTestR2 } from "../r2";
import { createUser } from "~/backend/accounts";
import { getOwnedBar, getPublicBar } from "~/backend/bars";
import { importBarCard } from "~/backend/mistral";
import { IMAGE_KEY_PATTERN, createBarFromForm, publishDraft, readImportFile, saveDraftFromEditor, storeBarImage } from "~/backend/services";
import { starterConfig } from "~/lib/seed";
import { routeRequest, withSecurityHeaders } from "~/lib/http";

function png(width: number, height: number) {
  const bytes = new Uint8Array(64);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

let db: D1Database;
let owner: string;
let barId: string;
beforeEach(async () => {
  db = createTestD1();
  owner = (await createUser(db, "owner@example.ch", "passwort1")).id;
  barId = await createBarFromForm(db, owner, { name: "Sommerbar", slug: "Sommer Bar", background: "#000000", accent: "#FFFFFF" });
});

describe("bar services", () => {
  it("creates bars from the form with a validated slug and theme", async () => {
    const owned = await getOwnedBar(db, owner, barId);
    expect(owned?.bar.slug).toBe("sommer-bar");
    expect(owned?.config.theme).toEqual({ background: "#000000", accent: "#ffffff" });
    await expect(createBarFromForm(db, owner, { name: " ", slug: "x-bar", background: "#000000", accent: "#000000" })).rejects.toThrow("Namen");
    await expect(createBarFromForm(db, owner, { name: "A", slug: "api", background: "#000000", accent: "#000000" })).rejects.toThrow("reserviert");
  });

  it("stores verified images under the bar's folder and only accepts those in configs", async () => {
    const bucket = createTestR2();
    const url = await storeBarImage(db, bucket, owner, barId, "logo", png(800, 600));
    expect(url).toMatch(new RegExp(`^/img/${owner}/${barId}/[0-9a-f-]{36}\\.png$`));
    expect(IMAGE_KEY_PATTERN.test(url.slice("/img/".length))).toBe(true);
    expect(bucket.objects.size).toBe(1);

    await saveDraftFromEditor(db, owner, barId, { ...starterConfig("Sommerbar"), logoUrl: url });
    await expect(saveDraftFromEditor(db, owner, barId, { ...starterConfig(), logoUrl: "https://tracker.example/x.png" })).rejects.toThrow("hochgeladen");
    expect(await publishDraft(db, owner, barId)).toBe(1);
    expect(await getPublicBar(db, "sommer-bar")).toMatchObject({ kind: "published", config: { logoUrl: url } });
  });

  it("rejects images by content, size and dimensions, and foreign bars", async () => {
    const bucket = createTestR2();
    await expect(storeBarImage(db, bucket, owner, barId, "logo", new TextEncoder().encode("<svg/>"))).rejects.toThrow("PNG, JPEG und WebP");
    await expect(storeBarImage(db, bucket, owner, barId, "logo", png(5000, 5000))).rejects.toThrow("Abmessungen");
    await expect(storeBarImage(db, bucket, owner, barId, "logo", new Uint8Array(4 * 1024 * 1024 + 1))).rejects.toThrow("4 MB");
    const other = (await createUser(db, "other@example.ch", "passwort1")).id;
    await expect(storeBarImage(db, bucket, other, barId, "logo", png(10, 10))).rejects.toThrow("Bar nicht gefunden");
    expect(bucket.objects.size).toBe(0);
  });

  it("accepts menu imports only for own bars and supported files", async () => {
    expect(await readImportFile(db, owner, barId, new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    await expect(readImportFile(db, owner, barId, new TextEncoder().encode("hello"))).rejects.toThrow("Erlaubt sind PDF");
    await expect(readImportFile(db, "someone", barId, png(1, 1))).rejects.toThrow("Bar nicht gefunden");
  });
});

describe("Mistral import", () => {
  const ocr = { pages: [{ markdown: "Bier\nLager 3dl 5.50", blocks: [] }] };
  const chat = { choices: [{ message: { content: JSON.stringify({ categories: [{ name: "Bier", emoji: "🍺", items: [{ name: "Lager", note: "", variants: [{ label: "3 dl", priceChf: 5.5, uncertain: false, uncertaintyReason: "" }] }] }], warnings: [] }) } }] };

  it("sends the file as a data URL to OCR, then structures it with a strict schema", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json(ocr))
      .mockResolvedValueOnce(Response.json(chat));
    const proposal = await importBarCard("key", new TextEncoder().encode("%PDF-1.7"), "application/pdf", fetcher);
    expect(proposal.categories[0].items[0].variants[0].price).toBe(550);
    const ocrBody = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(ocrBody.document).toEqual({ type: "document_url", document_url: `data:application/pdf;base64,${btoa("%PDF-1.7")}` });
    expect(fetcher.mock.calls[0][1].headers.authorization).toBe("Bearer key");
    const chatBody = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(chatBody.response_format.json_schema.strict).toBe(true);
  });

  it("maps failures to friendly messages", async () => {
    await expect(importBarCard(undefined, new Uint8Array([1]), "image/png")).rejects.toThrow("nicht konfiguriert");
    await expect(importBarCard("key", new Uint8Array([1]), "image/png", vi.fn().mockResolvedValue(new Response("", { status: 429 })))).rejects.toThrow("ausgelastet");
    await expect(importBarCard("key", new Uint8Array([1]), "image/png", vi.fn().mockRejectedValue(new TypeError("fetch failed")))).rejects.toThrow("nicht erreichbar");
    const tooMany = { pages: Array.from({ length: 21 }, () => ({ markdown: "x" })) };
    await expect(importBarCard("key", new Uint8Array([1]), "image/png", vi.fn().mockResolvedValue(Response.json(tooMany)))).rejects.toThrow("höchstens 20 Seiten");
  });
});

describe("host routing", () => {
  const request = (url: string, init: RequestInit & { host?: string } = {}) => new Request(url, { ...init, headers: { host: init.host ?? new URL(url).host, ...(init.headers as Record<string, string>) } });

  it("redirects www and limits tenant hosts to the calculator", () => {
    expect(routeRequest(request("https://www.barrechner.ch/x?y=1"), "barrechner.ch")).toEqual({ kind: "redirect", location: "https://barrechner.ch/x?y=1" });
    expect(routeRequest(request("https://bar.barrechner.ch/"), "barrechner.ch")).toEqual({ kind: "pass", private: false });
    expect(routeRequest(request("https://bar.barrechner.ch/img/a/b/c.webp"), "barrechner.ch").kind).toBe("pass");
    expect(routeRequest(request("https://bar.barrechner.ch/dashboard"), "barrechner.ch")).toEqual({ kind: "not-found" });
    expect(routeRequest(request("https://barrechner.ch/dashboard"), "barrechner.ch")).toEqual({ kind: "pass", private: true });
  });

  it("rejects cross-site server-function posts", () => {
    expect(routeRequest(request("https://barrechner.ch/_serverFn/x", { method: "POST", headers: { origin: "https://evil.example" } }), "barrechner.ch")).toEqual({ kind: "forbidden" });
    expect(routeRequest(request("https://barrechner.ch/_serverFn/x", { method: "POST", headers: { origin: "https://barrechner.ch" } }), "barrechner.ch").kind).toBe("pass");
  });

  it("adds security headers and no-store for private pages", () => {
    const response = withSecurityHeaders(new Response("ok", { headers: { "Cache-Control": "public" } }), true);
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("strict-transport-security")).toContain("includeSubDomains");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
