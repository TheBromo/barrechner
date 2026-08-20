import { describe, expect, it } from "vitest";
import { decodeStoredOrder, encodeStoredOrder, type OrderLine } from "./order-storage";

const lines: OrderLine[] = [{ key: "lager:3dl", drinkName: "Lager", variantLabel: "3 dl", price: 500, qty: 2 }];

describe("revision-aware device orders", () => {
  it("restores an order from the same published revision", () => expect(decodeStoredOrder(encodeStoredOrder(3, lines), 3)).toEqual({ lines, stale: false }));
  it("clears and reports an order from an old revision", () => expect(decodeStoredOrder(encodeStoredOrder(2, lines), 3)).toEqual({ lines: [], stale: true }));
  it("ignores malformed storage", () => expect(decodeStoredOrder("not json", 1)).toEqual({ lines: [], stale: false }));
});
