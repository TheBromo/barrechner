import { describe, expect, it } from "vitest";
import { normalizeSlug, validateSlug } from "~/lib/slug";
import { formatPrice, parsePrice, priceInput } from "~/lib/format";
import { decodeStoredOrder, encodeStoredOrder, type OrderLine } from "~/lib/order-storage";
import { safeNextPath } from "~/lib/redirect";
import { GENERIC_ERROR, UserError, userMessage } from "~/lib/errors";
import { hasRecentEmailLinkLogin } from "~/lib/reauth";

describe("bar slugs", () => {
  it("normalizes Swiss display names", () => {
    expect(normalizeSlug("  Bär & Fäscht  ")).toBe("bar-fascht");
    expect(normalizeSlug("Café Zürich!")).toBe("cafe-zurich");
    expect(normalizeSlug("a".repeat(31) + "-b")).toBe("a".repeat(31));
  });
  it("rejects reserved and short addresses", () => {
    expect(() => validateSlug("admin")).toThrow("reserviert");
    expect(() => validateSlug("ab")).toThrow("mindestens");
  });
  it("accepts a stable tenant address", () => expect(validateSlug("Sommer Bar 26")).toBe("sommer-bar-26"));
});

describe("CHF prices", () => {
  it("parses decimal comma and formats rappen", () => {
    expect(parsePrice("17,50")).toBe(1750);
    expect(parsePrice("1’000")).toBe(100000);
    expect(formatPrice(1750)).toBe("17.50");
    expect(formatPrice(500)).toBe("5.–");
    expect(formatPrice(123456)).toBe("1’234.56");
    expect(priceInput(550)).toBe("5.50");
    expect(priceInput(500)).toBe("5");
  });
  it("rejects fractions of a Rappen and garbage", () => {
    expect(parsePrice("5.555")).toBeNaN();
    expect(parsePrice("")).toBeNaN();
    expect(parsePrice("-1")).toBeNaN();
  });
});

const lines: OrderLine[] = [{ key: "lager:3dl", drinkName: "Lager", variantLabel: "3 dl", price: 500, qty: 2 }];
describe("revision-aware device orders", () => {
  it("restores an order from the same published revision", () => expect(decodeStoredOrder(encodeStoredOrder(3, lines), 3)).toEqual({ lines, stale: false }));
  it("clears and reports an order from an old revision", () => expect(decodeStoredOrder(encodeStoredOrder(2, lines), 3)).toEqual({ lines: [], stale: true }));
  it("ignores malformed storage and invalid lines", () => {
    expect(decodeStoredOrder("not json", 1)).toEqual({ lines: [], stale: false });
    expect(decodeStoredOrder(JSON.stringify({ revision: 1, lines: [{ ...lines[0], qty: 0 }] }), 1).lines).toEqual([]);
  });
});

describe("post-login redirect targets", () => {
  it("keeps same-origin paths with query strings", () => {
    expect(safeNextPath("/passwort-neu")).toBe("/passwort-neu");
    expect(safeNextPath("/dashboard/bars/1?tab=karte")).toBe("/dashboard/bars/1?tab=karte");
  });
  it.each(["//evil.com", "/\\evil.com", "/\\/evil.com", "https://evil.com", "evil.com", "", null])("rejects %s", (value) => {
    expect(safeNextPath(value)).toBe("/dashboard");
  });
});

describe("user-facing error messages", () => {
  it("shows messages written for users", () => expect(userMessage(new UserError("Bitte gib deiner Bar einen Namen."))).toBe("Bitte gib deiner Bar einen Namen."));
  it("hides database and programming errors", () => {
    expect(userMessage(new Error("D1_ERROR: no such table: bars"))).toBe(GENERIC_ERROR);
    expect(userMessage(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(GENERIC_ERROR);
    expect(userMessage("boom", "Fallback")).toBe("Fallback");
  });
  it("explains slug conflicts", () => expect(userMessage(new Error("D1_ERROR: UNIQUE constraint failed: bars.slug: SQLITE_CONSTRAINT"))).toBe("Diese Adresse ist bereits vergeben."));
});

describe("recent email-link sessions", () => {
  it("allows a password change without the old password for 15 minutes", () => {
    const now = 1_000_000_000;
    expect(hasRecentEmailLinkLogin({ method: "email_link", authenticatedAt: now - 14 * 60_000 }, now)).toBe(true);
    expect(hasRecentEmailLinkLogin({ method: "email_link", authenticatedAt: now - 16 * 60_000 }, now)).toBe(false);
    expect(hasRecentEmailLinkLogin({ method: "password", authenticatedAt: now }, now)).toBe(false);
  });
});
