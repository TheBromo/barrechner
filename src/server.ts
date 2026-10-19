import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { runCleanup } from "./backend/cleanup";
import type { AppEnv } from "./backend/env.server";
import { routeRequest, withSecurityHeaders } from "./lib/http";
import { logError } from "./lib/log";

const app = createServerEntry({
  async fetch(request) {
    const { env } = await import("cloudflare:workers");
    const routing = routeRequest(request, (env as unknown as AppEnv).ROOT_DOMAIN ?? "");
    if (routing.kind === "redirect") return Response.redirect(routing.location, 308);
    if (routing.kind === "not-found") return withSecurityHeaders(new Response("Not found", { status: 404 }), false);
    if (routing.kind === "forbidden") return withSecurityHeaders(new Response("Forbidden", { status: 403 }), false);
    return withSecurityHeaders(await handler.fetch(request), routing.private);
  },
});

export default {
  ...app,
  /** Daily Cron Trigger (see alchemy.run.ts). */
  async scheduled(_controller: ScheduledController, env: AppEnv, ctx: ExecutionContext) {
    ctx.waitUntil(
      runCleanup(env.DB, env.IMAGES)
        .then((result) => console.log(JSON.stringify({ level: "info", event: "cleanup.done", ...result })))
        .catch((error) => logError("cleanup.failed", error)),
    );
  },
};
