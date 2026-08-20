export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "auth",
  "dashboard",
  "hilfe",
  "status",
  "support",
  "www",
]);

export function normalizeSlug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
}

export function validateSlug(input: string): string {
  const slug = normalizeSlug(input);
  if (slug.length < 3) throw new Error("Die Adresse muss mindestens 3 Zeichen lang sein.");
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    throw new Error("Die Adresse darf nur Buchstaben, Zahlen und Bindestriche enthalten.");
  }
  if (RESERVED_SLUGS.has(slug)) throw new Error("Diese Adresse ist reserviert.");
  return slug;
}
