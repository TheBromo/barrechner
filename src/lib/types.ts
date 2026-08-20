export type Variant = {
  id: string;
  label: string;
  /** Price in Swiss Rappen. */
  price: number;
};

export type Drink = {
  id: string;
  name: string;
  note?: string;
  active: boolean;
  variants: Variant[];
};

export type Category = {
  id: string;
  name: string;
  image: string;
  drinks: Drink[];
};

export type BarTheme = {
  background: string;
  accent: string;
};

export type BarConfig = {
  schemaVersion: 1;
  revision: number;
  updatedAt: string;
  displayName: string;
  logoUrl: string;
  theme: BarTheme;
  categories: Category[];
};

/** Kept as an alias while reusing the calculator/editor from the prototype. */
export type Menu = BarConfig;

export type BarStatus = "active" | "archived";

export type BarSummary = {
  id: string;
  slug: string;
  label: string;
  status: BarStatus;
  archivedAt: string | null;
  publishedRevision: number | null;
  updatedAt: string;
};

const MAX_PRICE = 10_000_000;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function stringField(value: unknown, field: string, maxLength = 200): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} fehlt.`);
  }
  return value.trim().slice(0, maxLength);
}

function safeId(value: unknown, field: string): string {
  const valueString = stringField(value, field, 64);
  if (!/^[a-zA-Z0-9_-]+$/.test(valueString)) {
    throw new Error(`${field} enthält ungültige Zeichen.`);
  }
  return valueString;
}

function safeImage(value: unknown, field: string): string {
  if (value === "" || value == null) return "";
  const image = stringField(value, field, 2048);
  if (!image.startsWith("/") && !image.startsWith("https://")) {
    throw new Error(`${field} ist keine gültige Bildadresse.`);
  }
  return image;
}

function safeColor(value: unknown, field: string): string {
  const color = stringField(value, field, 7).toLowerCase();
  if (!HEX_COLOR.test(color)) throw new Error(`${field} ist keine gültige Farbe.`);
  return color;
}

/** Validate all untrusted owner input before it reaches a draft or revision. */
export function sanitizeBarConfig(input: unknown): BarConfig {
  if (!input || typeof input !== "object") throw new Error("Ungültiges Bar-Format.");
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.categories) || raw.categories.length === 0) {
    throw new Error("Mindestens eine Kategorie ist erforderlich.");
  }
  if (raw.categories.length > 30) throw new Error("Maximal 30 Kategorien sind erlaubt.");

  const categoryIds = new Set<string>();
  const drinkIds = new Set<string>();
  const categories = raw.categories.map((category, categoryIndex): Category => {
    const rawCategory = (category ?? {}) as Record<string, unknown>;
    const name = stringField(rawCategory.name, `Kategorie ${categoryIndex + 1}: Name`, 80);
    if (!Array.isArray(rawCategory.drinks)) throw new Error(`${name}: Getränke fehlen.`);
    if (rawCategory.drinks.length > 100) throw new Error(`${name}: maximal 100 Getränke.`);

    const categoryId = safeId(rawCategory.id, `${name}: ID`);
    if (categoryIds.has(categoryId)) throw new Error(`Doppelte Kategorie-ID: ${categoryId}.`);
    categoryIds.add(categoryId);
    return {
      id: categoryId,
      name,
      image: safeImage(rawCategory.image, `${name}: Bild`),
      drinks: rawCategory.drinks.map((drink, drinkIndex): Drink => {
        const rawDrink = (drink ?? {}) as Record<string, unknown>;
        const drinkName = stringField(rawDrink.name, `${name}, Getränk ${drinkIndex + 1}`, 100);
        if (!Array.isArray(rawDrink.variants) || rawDrink.variants.length === 0) {
          throw new Error(`${drinkName}: mindestens ein Preis ist erforderlich.`);
        }
        if (rawDrink.variants.length > 20) throw new Error(`${drinkName}: maximal 20 Varianten.`);

        const drinkId = safeId(rawDrink.id, `${drinkName}: ID`);
        if (drinkIds.has(drinkId)) throw new Error(`Doppelte Getränke-ID: ${drinkId}.`);
        drinkIds.add(drinkId);
        const variantIds = new Set<string>();
        return {
          id: drinkId,
          name: drinkName,
          ...(typeof rawDrink.note === "string" && rawDrink.note.trim()
            ? { note: rawDrink.note.trim().slice(0, 200) }
            : {}),
          active: rawDrink.active !== false,
          variants: rawDrink.variants.map((variant, variantIndex): Variant => {
            const rawVariant = (variant ?? {}) as Record<string, unknown>;
            const price = Math.round(Number(rawVariant.price));
            if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE) {
              throw new Error(`${drinkName}, Preis ${variantIndex + 1}: ungültiger Preis.`);
            }
            const variantId = safeId(rawVariant.id, `${drinkName}, Variante ${variantIndex + 1}: ID`);
            if (variantIds.has(variantId)) throw new Error(`${drinkName}: doppelte Varianten-ID ${variantId}.`);
            variantIds.add(variantId);
            return {
              id: variantId,
              label: stringField(rawVariant.label, `${drinkName}, Variante ${variantIndex + 1}`, 40),
              price,
            };
          }),
        };
      }),
    };
  });

  return {
    schemaVersion: 1,
    revision: Number.isInteger(raw.revision) && Number(raw.revision) >= 0 ? Number(raw.revision) : 0,
    updatedAt: new Date().toISOString(),
    displayName: stringField(raw.displayName, "Barname", 80),
    logoUrl: safeImage(raw.logoUrl, "Logo"),
    theme: {
      background: safeColor((raw.theme as Record<string, unknown> | undefined)?.background, "Grundfarbe"),
      accent: safeColor((raw.theme as Record<string, unknown> | undefined)?.accent, "Akzentfarbe"),
    },
    categories,
  };
}

export const sanitizeMenu = sanitizeBarConfig;
