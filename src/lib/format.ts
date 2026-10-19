/** Formats Rappen as Swiss menu-style prices: 500 → "5.–", 1750 → "17.50", 123456 → "1’234.56". */
export function formatPrice(rappen: number): string {
  const francs = Math.floor(rappen / 100);
  const rest = rappen % 100;
  const fr = String(francs).replace(/\B(?=(\d{3})+(?!\d))/g, "’");
  return rest === 0 ? `${fr}.–` : `${fr}.${String(rest).padStart(2, "0")}`;
}

/** Parses admin price input ("5", "5.5", "5.50", "5,50", "1’000") into Rappen; NaN when invalid. */
export function parsePrice(input: string): number {
  const normalized = input.trim().replace(",", ".").replace(/[’']/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return NaN;
  return Math.round(parseFloat(normalized) * 100);
}

/** Rappen as an editable franc string: 500 → "5", 550 → "5.50". */
export function priceInput(rappen: number): string {
  return (rappen / 100).toFixed(2).replace(/\.00$/, "");
}
