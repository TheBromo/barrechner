import { createFileRoute } from "@tanstack/react-router";
import { isSlugAvailable } from "~/backend/bars";
import { db, rateLimit } from "~/backend/context.server";
import { userMessage } from "~/lib/errors";
import { validateSlug } from "~/lib/slug";

const headers = { "Cache-Control": "no-store" };

export const Route = createFileRoute("/api/slug-availability")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await rateLimit("slug-check", 80, 60 * 60);
          const slug = validateSlug(new URL(request.url).searchParams.get("slug") ?? "");
          return Response.json({ slug, available: await isSlugAvailable(db(), slug) }, { headers });
        } catch (error) {
          return Response.json({ available: false, error: userMessage(error, "Ungültige Adresse") }, { status: 400, headers });
        }
      },
    },
  },
});
