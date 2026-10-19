import { createFileRoute } from "@tanstack/react-router";
import { images } from "~/backend/context.server";
import { IMAGE_KEY_PATTERN } from "~/backend/services";

/** Serves uploaded bar images from R2 on the platform and every bar subdomain. Keys are immutable. */
export const Route = createFileRoute("/img/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const key = params._splat ?? "";
        if (!IMAGE_KEY_PATTERN.test(key)) return new Response("Not found", { status: 404 });
        const object = await images().get(key);
        if (!object) return new Response("Not found", { status: 404 });
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("Cache-Control", "public, max-age=31536000, immutable");
        headers.set("ETag", object.httpEtag);
        headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
        return new Response(object.body, { headers });
      },
    },
  },
});
