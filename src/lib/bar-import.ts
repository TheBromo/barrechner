import { UserError } from "./errors";
import { isSingleEmoji } from "./types";

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_PAGES = 20;
export const IMPORT_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;

export type ImportVariant = {
  id: string;
  label: string;
  /** Price in Swiss Rappen; null means the source did not contain a defensible value. */
  price: number | null;
};
export type ImportItem = { id: string; name: string; note: string; variants: ImportVariant[] };
export type ImportCategory = { id: string; name: string; emoji: string; items: ImportItem[] };
export type ImportWarning = { path: string; message: string };
export type ImportProposal = { categories: ImportCategory[]; warnings: ImportWarning[] };

const MAX_PRICE_RAPPEN = 10_000_000;

function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) throw new UserError(`${field} fehlt.`);
  if (value.trim().length > maxLength) throw new UserError(`${field} ist zu lang.`);
  return value.trim();
}

function optionalString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function generatedId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
}

/** Validate the untrusted structured LLM response and turn it into an editor-only proposal. */
export function validateImportProposal(input: unknown): ImportProposal {
  if (!input || typeof input !== "object") throw new UserError("Die erkannte Barkarte hat ein ungültiges Format.");
  const raw = input as { categories?: unknown; warnings?: unknown };
  if (!Array.isArray(raw.categories) || raw.categories.length === 0) throw new UserError("Es wurden keine Kategorien erkannt.");
  if (raw.categories.length > 30) throw new UserError("Die Barkarte enthält mehr als 30 Kategorien.");

  const warnings: ImportWarning[] = [];
  const categories = raw.categories.map((categoryValue, categoryIndex): ImportCategory => {
    const category = (categoryValue ?? {}) as { name?: unknown; emoji?: unknown; items?: unknown };
    const categoryName = requiredString(category.name, `Kategorie ${categoryIndex + 1}`, 80);
    const emoji = requiredString(category.emoji, `${categoryName}: Emoji`, 32);
    if (!isSingleEmoji(emoji)) throw new UserError(`${categoryName}: ungültiger Emoji-Vorschlag.`);
    if (!Array.isArray(category.items) || category.items.length === 0) throw new UserError(`${categoryName}: keine Getränke erkannt.`);
    if (category.items.length > 100) throw new UserError(`${categoryName}: mehr als 100 Getränke erkannt.`);

    const items = category.items.map((itemValue, itemIndex): ImportItem => {
      const item = (itemValue ?? {}) as { name?: unknown; note?: unknown; variants?: unknown };
      const itemName = requiredString(item.name, `${categoryName}, Getränk ${itemIndex + 1}`, 100);
      if (!Array.isArray(item.variants) || item.variants.length === 0) throw new UserError(`${itemName}: kein Preis erkannt.`);
      if (item.variants.length > 20) throw new UserError(`${itemName}: mehr als 20 Varianten erkannt.`);

      const variants = item.variants.map((variantValue, variantIndex): ImportVariant => {
        const variant = (variantValue ?? {}) as { label?: unknown; priceChf?: unknown; uncertain?: unknown; uncertaintyReason?: unknown };
        const label = optionalString(variant.label, 40) || "Standard";
        let price: number | null = null;
        if (variant.priceChf !== null && variant.priceChf !== undefined && variant.priceChf !== "") {
          const francs = Number(variant.priceChf);
          const rappen = Math.round(francs * 100);
          if (!Number.isFinite(francs) || rappen < 0 || rappen > MAX_PRICE_RAPPEN || Math.abs(francs * 100 - rappen) > 0.001) {
            throw new UserError(`${itemName}, ${label}: ungültiger Preis.`);
          }
          price = rappen;
        }
        if (variant.uncertain === true || price === null) {
          const reason = optionalString(variant.uncertaintyReason, 200);
          warnings.push({
            path: `categories.${categoryIndex}.items.${itemIndex}.variants.${variantIndex}`,
            message: reason ? `${itemName}: ${reason}` : price === null ? `${itemName}: Preis muss ergänzt werden.` : `${itemName}: Preiszuordnung bitte prüfen.`,
          });
        }
        return { id: generatedId("variant"), label, price };
      });
      return { id: generatedId("drink"), name: itemName, note: optionalString(item.note, 200), variants };
    });
    return { id: generatedId("cat"), name: categoryName, emoji, items };
  });

  if (Array.isArray(raw.warnings)) {
    for (const warningValue of raw.warnings.slice(0, 100)) {
      const warning = (warningValue ?? {}) as { path?: unknown; message?: unknown };
      const message = optionalString(warning.message, 240);
      if (message) warnings.push({ path: optionalString(warning.path, 160), message });
    }
  }

  const seen = new Set<string>();
  return {
    categories,
    warnings: warnings.filter((warning) => {
      const key = `${warning.path}\n${warning.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  };
}
