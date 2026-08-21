import { NextResponse, type NextRequest } from "next/server";
import { resolveHost } from "@/lib/hostname";
import { refreshAuthSession } from "@/lib/supabase/proxy";
import { configuredRootDomain } from "@/lib/urls";

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const root = configuredRootDomain();
  if (host.replace(/:\d+$/, "").toLowerCase() === `www.${root}`) {
    return NextResponse.redirect(new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${root}`), 308);
  }
  const context = resolveHost(host, root);
  if (context.kind === "tenant" && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = `/b/${context.slug}`;
    return NextResponse.rewrite(url);
  }
  if (context.kind === "tenant" && request.nextUrl.pathname.startsWith("/b/")) return new NextResponse(null, { status: 404 });
  if (
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/auth") ||
    request.nextUrl.pathname.startsWith("/email-bestaetigen")
  ) {
    return refreshAuthSession(request, NextResponse.next());
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-512.png|sw.js|.*\\.(?:png|jpg|jpeg|gif|webp|svg)$).*)"] };
