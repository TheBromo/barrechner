import { UserError } from "./errors";

export type Variant = {
  id: string;
  label: string;
  /** Price in Swiss Rappen. */
  price: number;
};

export type Drink = { id: string; name: string; note?: string; active: boolean; variants: Variant[] };
export type Category = { id: string; name: string; image: string; emoji: string; drinks: Drink[] };
export type BarTheme = { background: string; accent: string };

export type BarConfig = {
  schemaVersion: 1;
  revision: number;
  updatedAt: string;
  displayName: string;
  logoUrl: string;
  logoEmoji: string;
  theme: BarTheme;
  categories: Category[];
};

export type BarStatus = "active" | "archived";

export type BarSummary = {
  id: string;
  slug: string;
  label: string;
  status: BarStatus;
  archivedAt: number | null;
  publishedRevision: number | null;
  updatedAt: number;
};

export const MAX_ACTIVE_BARS = 5;
export const MAX_PRICE = 10_000_000;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const EMOJI_CONTENT = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function fail(message: string): never {
  throw new UserError(message);
}

function stringField(value: unknown, field: string, maxLength = 200): string {
  if (typeof value !== "string" || !value.trim()) fail(`${field} fehlt.`);
  return value.trim().slice(0, maxLength);
}

function safeId(value: unknown, field: string): string {
  const id = stringField(value, field, 64);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) fail(`${field} enthält ungültige Zeichen.`);
  return id;
}

function safeImage(value: unknown, field: string): string {
  if (value === "" || value == null) return "";
  const image = stringField(value, field, 2048);
  if (!image.startsWith("/") && !image.startsWith("https://")) fail(`${field} ist keine gültige Bildadresse.`);
  return image;
}

export function isSingleEmoji(value: string): boolean {
  const emoji = value.trim();
  if (!emoji || emoji.length > 32 || !EMOJI_CONTENT.test(emoji)) return false;
  return Array.from(graphemeSegmenter.segment(emoji)).length === 1;
}

function safeEmoji(value: unknown, field: string): string {
  if (value === "" || value == null) return "";
  if (typeof value !== "string" || !isSingleEmoji(value)) fail(`${field} muss genau ein Emoji sein.`);
  return value.trim();
}

function safeColor(value: unknown, field: string): string {
  const color = stringField(value, field, 7).toLowerCase();
  if (!HEX_COLOR.test(color)) fail(`${field} ist keine gültige Farbe.`);
  return color;
}

/** Validate all untrusted owner input before it reaches a draft or revision. */
export function sanitizeBarConfig(input: unknown): BarConfig {
  if (!input || typeof input !== "object") fail("Ungültiges Bar-Format.");
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.categories) || raw.categories.length === 0) fail("Mindestens eine Kategorie ist erforderlich.");
  if (raw.categories.length > 30) fail("Maximal 30 Kategorien sind erlaubt.");

  const categoryIds = new Set<string>();
  const drinkIds = new Set<string>();
  const categories = raw.categories.map((category, categoryIndex): Category => {
    const rawCategory = (category ?? {}) as Record<string, unknown>;
    const name = stringField(rawCategory.name, `Kategorie ${categoryIndex + 1}: Name`, 80);
    if (!Array.isArray(rawCategory.drinks)) fail(`${name}: Getränke fehlen.`);
    if (rawCategory.drinks.length > 100) fail(`${name}: maximal 100 Getränke.`);
    const categoryId = safeId(rawCategory.id, `${name}: ID`);
    if (categoryIds.has(categoryId)) fail(`Doppelte Kategorie-ID: ${categoryId}.`);
    categoryIds.add(categoryId);
    const image = safeImage(rawCategory.image, `${name}: Bild`);
    const emoji = safeEmoji(rawCategory.emoji, `${name}: Emoji`);
    if (image && emoji) fail(`${name}: Bitte wähle entweder ein Emoji oder ein Bild.`);
    return {
      id: categoryId,
      name,
      image,
      emoji,
      drinks: rawCategory.drinks.map((drink, drinkIndex): Drink => {
        const rawDrink = (drink ?? {}) as Record<string, unknown>;
        const drinkName = stringField(rawDrink.name, `${name}, Getränk ${drinkIndex + 1}`, 100);
        if (!Array.isArray(rawDrink.variants) || rawDrink.variants.length === 0) fail(`${drinkName}: mindestens ein Preis ist erforderlich.`);
        if (rawDrink.variants.length > 20) fail(`${drinkName}: maximal 20 Varianten.`);
        const drinkId = safeId(rawDrink.id, `${drinkName}: ID`);
        if (drinkIds.has(drinkId)) fail(`Doppelte Getränke-ID: ${drinkId}.`);
        drinkIds.add(drinkId);
        const variantIds = new Set<string>();
        return {
          id: drinkId,
          name: drinkName,
          ...(typeof rawDrink.note === "string" && rawDrink.note.trim() ? { note: rawDrink.note.trim().slice(0, 200) } : {}),
          active: rawDrink.active !== false,
          variants: rawDrink.variants.map((variant, variantIndex): Variant => {
            const rawVariant = (variant ?? {}) as Record<string, unknown>;
            const price = typeof rawVariant.price === "number" ? Math.round(rawVariant.price) : NaN;
            if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE) fail(`${drinkName}, Preis ${variantIndex + 1}: ungültiger Preis.`);
            const variantId = safeId(rawVariant.id, `${drinkName}, Variante ${variantIndex + 1}: ID`);
            if (variantIds.has(variantId)) fail(`${drinkName}: doppelte Varianten-ID ${variantId}.`);
            variantIds.add(variantId);
            return { id: variantId, label: stringField(rawVariant.label, `${drinkName}, Variante ${variantIndex + 1}`, 40), price };
          }),
        };
      }),
    };
  });

  const logoUrl = safeImage(raw.logoUrl, "Logo");
  const logoEmoji = safeEmoji(raw.logoEmoji, "Logo-Emoji");
  if (logoUrl && logoEmoji) fail("Logo: Bitte wähle entweder ein Emoji oder ein Bild.");
  const theme = (raw.theme ?? {}) as Record<string, unknown>;

  return {
    schemaVersion: 1,
    revision: Number.isInteger(raw.revision) && Number(raw.revision) >= 0 ? Number(raw.revision) : 0,
    updatedAt: new Date().toISOString(),
    displayName: stringField(raw.displayName, "Barname", 80),
    logoUrl,
    logoEmoji,
    theme: { background: safeColor(theme.background, "Grundfarbe"), accent: safeColor(theme.accent, "Akzentfarbe") },
    categories,
  };
}
