export const DEFAULT_ROOT_DOMAIN = "barrechner.ch";

export function configuredRootDomain(value = process.env.NEXT_PUBLIC_ROOT_DOMAIN): string {
  const candidate = value?.trim();
  if (!candidate) return DEFAULT_ROOT_DOMAIN;

  try {
    const url = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
    return url.hostname.toLowerCase().replace(/\.$/, "") || DEFAULT_ROOT_DOMAIN;
  } catch {
    return DEFAULT_ROOT_DOMAIN;
  }
}

export function platformOrigin(): string {
  if (process.env.NODE_ENV === "development") return "http://localhost:3000";
  return `https://${configuredRootDomain()}`;
}

export function tenantOrigin(slug: string): string {
  if (process.env.NODE_ENV === "development") return `http://${slug}.localhost:3000`;
  return `https://${slug}.${configuredRootDomain()}`;
}
