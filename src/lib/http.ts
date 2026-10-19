import { hostnameWithoutPort, resolveHost } from "./hostname";

export const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
};

/** Paths a bar subdomain serves besides static build assets (those never reach the Worker). */
const TENANT_PATHS = [/^\/$/, /^\/manifest\.webmanifest$/, /^\/img\//, /^\/_serverFn\//];
const PRIVATE_PATHS = [/^\/dashboard/, /^\/anmelden/, /^\/registrieren/, /^\/passwort-/, /^\/email-bestaetigen/, /^\/auth\//, /^\/_serverFn\//];

export type Routing = { kind: "redirect"; location: string } | { kind: "not-found" } | { kind: "forbidden" } | { kind: "pass"; private: boolean };

/** Host-level routing decided before the app runs. */
export function routeRequest(request: Request, rootDomain: string): Routing {
  const url = new URL(request.url);
  const host = hostnameWithoutPort(request.headers.get("host") ?? url.host);
  if (rootDomain && host === `www.${rootDomain}`) return { kind: "redirect", location: `https://${rootDomain}${url.pathname}${url.search}` };
  // Server functions are only called by our own pages; reject cross-site POSTs outright.
  if (request.method !== "GET" && request.method !== "HEAD" && url.pathname.startsWith("/_serverFn/")) {
    const origin = request.headers.get("origin");
    if (origin && hostnameWithoutPort(new URL(origin).host) !== host) return { kind: "forbidden" };
  }
  if (resolveHost(host, rootDomain).kind === "tenant" && !TENANT_PATHS.some((pattern) => pattern.test(url.pathname))) return { kind: "not-found" };
  return { kind: "pass", private: PRIVATE_PATHS.some((pattern) => pattern.test(url.pathname)) };
}

export function withSecurityHeaders(response: Response, isPrivate: boolean): Response {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) if (!secured.headers.has(name)) secured.headers.set(name, value);
  if (isPrivate) secured.headers.set("Cache-Control", "private, no-store");
  return secured;
}
