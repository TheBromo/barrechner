/** Formats Rappen as Swiss menu-style prices: 500 → "5.–", 1750 → "17.50" */
export function formatPrice(rappen: number): string {
  const francs = Math.floor(rappen / 100);
  const rest = rappen % 100;
  const fr = francs.toLocaleString("de-CH").replace(/,/g, "’");
  return rest === 0 ? `${fr}.–` : `${fr}.${String(rest).padStart(2, "0")}`;
}

/** Parses admin price input ("5", "5.5", "5.50", "5,50") into Rappen; NaN when invalid. */
export function parsePrice(input: string): number {
  const normalized = input.trim().replace(",", ".").replace(/[’']/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return NaN;
  return Math.round(parseFloat(normalized) * 100);
}
