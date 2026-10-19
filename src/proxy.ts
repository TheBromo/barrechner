import { NextResponse, type NextRequest } from "next/server";
import { resolveHost } from "@/lib/hostname";
import { refreshAuthSession } from "@/lib/supabase/proxy";
import { configuredRootDomain } from "@/lib/urls";

// Paths a tenant host serves besides static assets, which the matcher already excludes.
const TENANT_PATHS = new Set(["/", "/manifest.webmanifest"]);
const SESSION_PATHS = ["/dashboard", "/auth", "/email-bestaetigen", "/passwort-neu"];

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const root = configuredRootDomain();
  const { pathname } = request.nextUrl;
  if (host.replace(/:\d+$/, "").toLowerCase() === `www.${root}`) {
    return NextResponse.redirect(new URL(pathname + request.nextUrl.search, `https://${root}`), 308);
  }
  const context = resolveHost(host, root);
  if (context.kind === "tenant") {
    if (!TENANT_PATHS.has(pathname)) return new NextResponse(null, { status: 404 });
    if (pathname !== "/") return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = `/b/${context.slug}`;
    return NextResponse.rewrite(url);
  }
  // Calculators only render on their own subdomain, so their service worker never controls the platform.
  if (pathname === "/b" || pathname.startsWith("/b/")) return new NextResponse(null, { status: 404 });
  if (SESSION_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return refreshAuthSession(request, NextResponse.next());
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-512.png|sw.js|.*\\.(?:png|jpg|jpeg|gif|webp|svg)$).*)"] };
