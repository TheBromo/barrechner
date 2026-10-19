export type OrderLine = { key: string; drinkName: string; variantLabel: string; price: number; qty: number };

type StoredOrder = { revision: number; lines: OrderLine[] };

export function orderStorageKey(slug: string): string {
  return `barrechner-order:${slug}`;
}

export function decodeStoredOrder(raw: string | null, revision: number): { lines: OrderLine[]; stale: boolean } {
  if (!raw) return { lines: [], stale: false };
  try {
    const parsed = JSON.parse(raw) as StoredOrder;
    if (!parsed || !Array.isArray(parsed.lines)) return { lines: [], stale: false };
    if (parsed.revision !== revision) return { lines: [], stale: parsed.lines.length > 0 };
    return {
      lines: parsed.lines.filter((line) =>
        typeof line.key === "string" &&
        typeof line.drinkName === "string" &&
        typeof line.variantLabel === "string" &&
        Number.isFinite(line.price) &&
        line.price >= 0 &&
        Number.isInteger(line.qty) &&
        line.qty > 0
      ),
      stale: false,
    };
  } catch {
    return { lines: [], stale: false };
  }
}

export function encodeStoredOrder(revision: number, lines: OrderLine[]): string {
  return JSON.stringify({ revision, lines } satisfies StoredOrder);
}
