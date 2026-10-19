import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { attempt } from "~/backend/attempt.server";
import { archiveBar, discardDraft, getOwnedBar, listOwnedBars, renameBar, restoreBar } from "~/backend/bars";
import { db, images, origins, rateLimit, requireSession } from "~/backend/context.server";
import { env } from "~/backend/env.server";
import { importBarCard } from "~/backend/mistral";
import { createBarFromForm, publishDraft, readImportFile, saveDraftFromEditor, storeBarImage } from "~/backend/services";
import type { AssetKind } from "~/lib/assets";
import { emailVerificationState } from "~/lib/email-verification";
import { UserError } from "~/lib/errors";
import { validateSlug } from "~/lib/slug";

type Fields = Record<string, unknown>;
const fields = (data: unknown): Fields => (data && typeof data === "object" ? (data as Fields) : {});
const barIdInput = (data: unknown) => ({ barId: String(fields(data).barId ?? "") });
const formInput = (data: unknown) => {
  if (!(data instanceof FormData)) throw new UserError("Ungültige Anfrage.");
  return data;
};

export const getDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  return { bars: await listOwnedBars(db(), session.user.id), origins: origins(), email: session.user.email, verification: emailVerificationState(session.user) };
});

export const getBarForEditor = createServerFn({ method: "GET" }).validator(barIdInput).handler(async ({ data }) => {
  const session = await requireSession();
  const owned = await getOwnedBar(db(), session.user.id, data.barId);
  if (!owned) throw notFound();
  return {
    bar: { id: owned.bar.id, slug: owned.bar.slug, status: owned.bar.status },
    config: owned.config,
    publishedVersion: owned.publishedVersion,
    origins: origins(),
    importEnabled: Boolean(env.MISTRAL_API_KEY),
  };
});

export const createBar = createServerFn({ method: "POST" }).validator(fields).handler(async ({ data }) =>
  attempt("bar.create", async () => {
    const session = await requireSession();
    await rateLimit("create-bar", 8, 60 * 60);
    return { barId: await createBarFromForm(db(), session.user.id, data as never) };
  }),
);

export const saveDraft = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ barId: String(fields(data).barId ?? ""), config: fields(data).config }))
  .handler(async ({ data }) =>
    attempt("bar.draft.save", async () => {
      const session = await requireSession();
      await saveDraftFromEditor(db(), session.user.id, data.barId, data.config);
      return {};
    }),
  );

export const publishBar = createServerFn({ method: "POST" }).validator(barIdInput).handler(async ({ data }) =>
  attempt("bar.publish", async () => {
    const session = await requireSession();
    await rateLimit("publish-bar", 20, 60 * 60);
    return { version: await publishDraft(db(), session.user.id, data.barId) };
  }),
);

export const discardBarDraft = createServerFn({ method: "POST" }).validator(barIdInput).handler(async ({ data }) =>
  attempt("bar.draft.discard", async () => {
    const session = await requireSession();
    await discardDraft(db(), session.user.id, data.barId);
    return {};
  }),
);

export const renameBarSlug = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ barId: String(fields(data).barId ?? ""), slug: String(fields(data).slug ?? "") }))
  .handler(async ({ data }) =>
    attempt("bar.rename", async () => {
      const session = await requireSession();
      await rateLimit("rename-bar", 10, 60 * 60);
      const slug = validateSlug(data.slug);
      await renameBar(db(), session.user.id, data.barId, slug);
      return { slug };
    }),
  );

export const archiveBarById = createServerFn({ method: "POST" }).validator(barIdInput).handler(async ({ data }) =>
  attempt("bar.archive", async () => {
    const session = await requireSession();
    await archiveBar(db(), session.user.id, data.barId);
    return {};
  }),
);

export const restoreBarById = createServerFn({ method: "POST" }).validator(barIdInput).handler(async ({ data }) =>
  attempt("bar.restore", async () => {
    const session = await requireSession();
    await restoreBar(db(), session.user.id, data.barId);
    return {};
  }),
);

/** FormData: barId, kind ("logo" | "category"), file (already downsized in the browser). */
export const uploadBarImage = createServerFn({ method: "POST" }).validator(formInput).handler(async ({ data }) =>
  attempt("asset.upload", async () => {
    const session = await requireSession();
    await rateLimit("upload", 40, 60 * 60);
    const file = data.get("file");
    const kind: AssetKind = data.get("kind") === "logo" ? "logo" : "category";
    if (!(file instanceof Blob)) throw new UserError("Keine Datei ausgewählt.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { url: await storeBarImage(db(), images(), session.user.id, String(data.get("barId") ?? ""), kind, bytes) };
  }, "Das Bild konnte nicht hochgeladen werden. Bitte versuche es erneut."),
);

/** FormData: barId, file. The file goes straight to Mistral and is never stored. */
export const importMenu = createServerFn({ method: "POST" }).validator(formInput).handler(async ({ data }) =>
  attempt("bar.import", async () => {
    const session = await requireSession();
    await rateLimit("bar-import", 10, 60 * 60);
    const file = data.get("file");
    if (!(file instanceof Blob)) throw new UserError("Keine Datei ausgewählt.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = await readImportFile(db(), session.user.id, String(data.get("barId") ?? ""), bytes);
    return { proposal: await importBarCard(env.MISTRAL_API_KEY, bytes, type) };
  }, "Import fehlgeschlagen."),
);
