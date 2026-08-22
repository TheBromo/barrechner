import { randomUUID } from "crypto";
import { isSingleEmoji } from "./types";

export const BAR_IMPORT_BUCKET = "bar-imports";
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_PAGES = 20;
export const IMPORT_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;

export type ImportMimeType = (typeof IMPORT_MIME_TYPES)[number];

export type ImportVariant = {
  id: string;
  label: string;
  /** Price in Swiss Rappen; null means the source did not contain a defensible value. */
  price: number | null;
};

export type ImportItem = {
  id: string;
  name: string;
  note: string;
  variants: ImportVariant[];
};

export type ImportCategory = {
  id: string;
  name: string;
  emoji: string;
  items: ImportItem[];
};

export type ImportWarning = {
  path: string;
  message: string;
};

export type ImportProposal = {
  categories: ImportCategory[];
  warnings: ImportWarning[];
};

type RawImportVariant = {
  label?: unknown;
  priceChf?: unknown;
  uncertain?: unknown;
  uncertaintyReason?: unknown;
};

type RawImportItem = {
  name?: unknown;
  note?: unknown;
  variants?: unknown;
};

type RawImportCategory = {
  name?: unknown;
  emoji?: unknown;
  items?: unknown;
};

const MAX_PRICE_RAPPEN = 10_000_000;

function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} fehlt.`);
  if (value.trim().length > maxLength) throw new Error(`${field} ist zu lang.`);
  return value.trim();
}

function optionalString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function generatedId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}`;
}

export function isImportMimeType(value: string): value is ImportMimeType {
  return (IMPORT_MIME_TYPES as readonly string[]).includes(value);
}

export function extensionForImportMime(mimeType: ImportMimeType): string {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

export function detectImportMime(bytes: Uint8Array): ImportMimeType | null {
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") return "application/pdf";
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) return "image/webp";
  return null;
}

/** Validate the untrusted structured LLM response and turn it into an editor-only proposal. */
export function validateImportProposal(input: unknown): ImportProposal {
  if (!input || typeof input !== "object") throw new Error("Die erkannte Barkarte hat ein ungültiges Format.");
  const raw = input as { categories?: unknown; warnings?: unknown };
  if (!Array.isArray(raw.categories) || raw.categories.length === 0) throw new Error("Es wurden keine Kategorien erkannt.");
  if (raw.categories.length > 30) throw new Error("Die Barkarte enthält mehr als 30 Kategorien.");

  const warnings: ImportWarning[] = [];
  const categories = raw.categories.map((categoryValue, categoryIndex): ImportCategory => {
    const category = (categoryValue ?? {}) as RawImportCategory;
    const categoryName = requiredString(category.name, `Kategorie ${categoryIndex + 1}`, 80);
    const emoji = requiredString(category.emoji, `${categoryName}: Emoji`, 32);
    if (!isSingleEmoji(emoji)) throw new Error(`${categoryName}: ungültiger Emoji-Vorschlag.`);
    if (!Array.isArray(category.items) || category.items.length === 0) throw new Error(`${categoryName}: keine Getränke erkannt.`);
    if (category.items.length > 100) throw new Error(`${categoryName}: mehr als 100 Getränke erkannt.`);

    const items = category.items.map((itemValue, itemIndex): ImportItem => {
      const item = (itemValue ?? {}) as RawImportItem;
      const itemName = requiredString(item.name, `${categoryName}, Getränk ${itemIndex + 1}`, 100);
      if (!Array.isArray(item.variants) || item.variants.length === 0) throw new Error(`${itemName}: kein Preis erkannt.`);
      if (item.variants.length > 20) throw new Error(`${itemName}: mehr als 20 Varianten erkannt.`);

      const variants = item.variants.map((variantValue, variantIndex): ImportVariant => {
        const variant = (variantValue ?? {}) as RawImportVariant;
        const label = optionalString(variant.label, 40) || "Standard";
        let price: number | null = null;
        if (variant.priceChf !== null && variant.priceChf !== undefined && variant.priceChf !== "") {
          const francs = Number(variant.priceChf);
          const rappen = Math.round(francs * 100);
          if (!Number.isFinite(francs) || rappen < 0 || rappen > MAX_PRICE_RAPPEN || Math.abs(francs * 100 - rappen) > 0.001) {
            throw new Error(`${itemName}, ${label}: ungültiger Preis.`);
          }
          price = rappen;
        }
        const path = `categories.${categoryIndex}.items.${itemIndex}.variants.${variantIndex}`;
        if (variant.uncertain === true || price === null) {
          const reason = optionalString(variant.uncertaintyReason, 200);
          warnings.push({
            path,
            message: reason ? `${itemName}: ${reason}` : (price === null ? `${itemName}: Preis muss ergänzt werden.` : `${itemName}: Preiszuordnung bitte prüfen.`),
          });
        }
        return { id: generatedId("variant"), label, price };
      });

      return {
        id: generatedId("drink"),
        name: itemName,
        note: optionalString(item.note, 200),
        variants,
      };
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

  const seenWarnings = new Set<string>();
  const uniqueWarnings = warnings.filter((warning) => {
    const key = `${warning.path}\n${warning.message}`;
    if (seenWarnings.has(key)) return false;
    seenWarnings.add(key);
    return true;
  });
  return { categories, warnings: uniqueWarnings };
}
