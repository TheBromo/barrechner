import { ASSET_MAX_EDGE, MAX_ASSET_BYTES, MAX_ASSET_PIXELS, assertHostedImages, assetPublicUrl, barAssetFolder, type AssetKind } from "~/lib/assets";
import { MAX_IMPORT_BYTES } from "~/lib/bar-import";
import { UserError } from "~/lib/errors";
import { detectFileType, extensionFor, imageDimensions, type ImportMimeType } from "~/lib/files";
import { starterConfig } from "~/lib/seed";
import { validateSlug } from "~/lib/slug";
import { sanitizeBarConfig } from "~/lib/types";
import { createBar, getOwnedBar, ownsBar, publishBar, recordAsset, saveDraft } from "./bars";

/** Business rules on top of the repositories; free of request context so they are testable. */

export async function createBarFromForm(db: D1Database, ownerId: string, input: { name: unknown; slug: unknown; background: unknown; accent: unknown }) {
  const label = String(input.name ?? "").trim().slice(0, 80);
  if (!label) throw new UserError("Bitte gib deiner Bar einen Namen.");
  const slug = validateSlug(String(input.slug ?? ""));
  const config = sanitizeBarConfig({
    ...starterConfig(label),
    theme: { background: String(input.background ?? "#101a17"), accent: String(input.accent ?? "#f3ba45") },
  });
  return createBar(db, ownerId, slug, config);
}

export async function saveDraftFromEditor(db: D1Database, ownerId: string, barId: string, rawConfig: unknown) {
  const config = sanitizeBarConfig(rawConfig);
  assertHostedImages(config, barAssetFolder(ownerId, barId));
  await saveDraft(db, ownerId, barId, config);
}

export async function publishDraft(db: D1Database, ownerId: string, barId: string): Promise<number> {
  const owned = await getOwnedBar(db, ownerId, barId);
  if (!owned) throw new UserError("Bar nicht gefunden.");
  // Drafts are validated on save; re-check in case the rules tightened since.
  assertHostedImages(sanitizeBarConfig(owned.config), barAssetFolder(ownerId, barId));
  return publishBar(db, ownerId, barId);
}

/**
 * Store an uploaded logo or category image. The browser downsizes and re-encodes it; the server
 * still verifies format by content, byte size and pixel dimensions before anything is stored.
 */
export async function storeBarImage(db: D1Database, bucket: R2Bucket, ownerId: string, barId: string, kind: AssetKind, bytes: Uint8Array): Promise<string> {
  if (bytes.length === 0) throw new UserError("Keine Datei ausgewählt.");
  if (bytes.length > MAX_ASSET_BYTES) throw new UserError("Das Bild ist grösser als 4 MB.");
  const type = detectFileType(bytes);
  if (!type || type === "application/pdf") throw new UserError("Erlaubt sind PNG, JPEG und WebP.");
  const size = imageDimensions(bytes);
  const maxEdge = ASSET_MAX_EDGE[kind] * 2;
  if (!size || !size.width || !size.height || size.width * size.height > MAX_ASSET_PIXELS || Math.max(size.width, size.height) > maxEdge) {
    throw new UserError("Das Bild hat ungültige oder zu grosse Abmessungen.");
  }
  if (!(await ownsBar(db, ownerId, barId))) throw new UserError("Bar nicht gefunden.");
  const key = `${barAssetFolder(ownerId, barId)}${crypto.randomUUID()}.${extensionFor(type)}`;
  await bucket.put(key, bytes, { httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" } });
  try {
    await recordAsset(db, { ownerId, barId, storageKey: key, publicUrl: assetPublicUrl(key), kind });
  } catch (error) {
    await bucket.delete(key);
    throw error;
  }
  return assetPublicUrl(key);
}

export async function readImportFile(db: D1Database, ownerId: string, barId: string, bytes: Uint8Array): Promise<ImportMimeType> {
  if (bytes.length === 0 || bytes.length > MAX_IMPORT_BYTES) throw new UserError("Die Datei muss zwischen 1 Byte und 10 MB gross sein.");
  const type = detectFileType(bytes);
  if (!type) throw new UserError("Erlaubt sind PDF, PNG, JPEG und WebP.");
  if (!(await ownsBar(db, ownerId, barId))) throw new UserError("Bar nicht gefunden.");
  return type;
}

/** Image keys are `{owner}/{bar}/{uuid}.{ext}`; anything else is not served. */
export const IMAGE_KEY_PATTERN = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:webp|png|jpg)$/;
