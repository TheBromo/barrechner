import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { resolveHost } from "@/lib/hostname";
import { getPublicBar } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const host = (await headers()).get("host") ?? "";
  const context = resolveHost(host);
  let name = "Barrechner";
  let background = "#101a17";
  let accent = "#f3ba45";
  if (context.kind === "tenant") {
    const result = await getPublicBar(context.slug);
    if (result.kind === "published") {
      name = result.config.displayName;
      background = result.config.theme.background;
      accent = result.config.theme.accent;
    }
  }
  const manifest: MetadataRoute.Manifest = { name: `${name} – Barrechner`, short_name: name.slice(0, 24), description: `Preisrechner für ${name}`, start_url: "/", display: "standalone", background_color: background, theme_color: accent, icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }] };
  return NextResponse.json(manifest, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300" } });
}
