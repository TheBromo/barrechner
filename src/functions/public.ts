import { notFound, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { getOwnedBar, getPublicBar } from "~/backend/bars";
import { db, origins, requireSession } from "~/backend/context.server";
import { env } from "~/backend/env.server";
import { resolveHost } from "~/lib/hostname";
import { normalizeSlug } from "~/lib/slug";
import { tenantUrl } from "~/lib/urls";

/**
 * What `/` shows: the landing page on the platform host, a bar's calculator on its subdomain.
 * Preview deployments have no wildcard subdomains and open calculators with `?bar={slug}`.
 */
export const getHome = createServerFn({ method: "GET" })
  .validator((data: unknown) => ({ bar: typeof (data as { bar?: unknown })?.bar === "string" ? (data as { bar: string }).bar : "" }))
  .handler(async ({ data }) => {
    const context = resolveHost(getRequestHeader("host") ?? "", env.ROOT_DOMAIN ?? "");
    const previewSlug = !env.ROOT_DOMAIN && data.bar ? normalizeSlug(data.bar) : "";
    const slug = context.kind === "tenant" ? context.slug : previewSlug;
    const currentOrigins = origins();
    if (!slug) return { kind: "platform" as const, origins: currentOrigins };
    const result = await getPublicBar(db(), slug);
    if (result.kind === "redirect") throw redirect({ href: tenantUrl(currentOrigins, result.slug) });
    setResponseHeader("Cache-Control", "no-cache");
    return { kind: "tenant" as const, slug, result, origins: currentOrigins, offline: context.kind === "tenant" };
  });

export const getDraftPreview = createServerFn({ method: "GET" })
  .validator((data: unknown) => ({ barId: String((data as { barId?: unknown })?.barId ?? "") }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const owned = await getOwnedBar(db(), session.user.id, data.barId);
    if (!owned) throw notFound();
    return { config: owned.config, origins: origins() };
  });
