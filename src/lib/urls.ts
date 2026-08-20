export function platformOrigin(): string {
  if (process.env.NODE_ENV === "development") return "http://localhost:3000";
  return `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "barrechner.ch"}`;
}

export function tenantOrigin(slug: string): string {
  if (process.env.NODE_ENV === "development") return `http://${slug}.localhost:3000`;
  return `https://${slug}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "barrechner.ch"}`;
}
