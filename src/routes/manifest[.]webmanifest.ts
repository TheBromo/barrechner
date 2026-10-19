import { createFileRoute } from "@tanstack/react-router";
import { getPublicBar } from "~/backend/bars";
import { db } from "~/backend/context.server";
import { env } from "~/backend/env.server";
import { resolveHost } from "~/lib/hostname";
import { DEFAULT_THEME } from "~/lib/seed";

export const Route = createFileRoute("/manifest.webmanifest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const context = resolveHost(request.headers.get("host") ?? "", env.ROOT_DOMAIN ?? "");
        let name = "Barrechner";
        let theme = DEFAULT_THEME;
        if (context.kind === "tenant") {
          const result = await getPublicBar(db(), context.slug);
          if (result.kind === "published") {
            name = result.config.displayName;
            theme = result.config.theme;
          }
        }
        const manifest = {
          name: context.kind === "tenant" ? `${name} – Barrechner` : name,
          short_name: name.slice(0, 24),
          description: context.kind === "tenant" ? `Preisrechner für ${name}` : "Der schnelle Preisrechner für Vereinsfeste und kleine Bars.",
          start_url: "/",
          display: "standalone",
          background_color: theme.background,
          theme_color: theme.accent,
          icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          ],
        };
        return new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300" } });
      },
    },
  },
});
