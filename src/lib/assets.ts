import { UserError } from "./errors";
import type { BarConfig } from "./types";

export const MAX_ASSET_BYTES = 4 * 1024 * 1024;
export const MAX_ASSET_PIXELS = 24_000_000;
export const ASSET_MAX_EDGE = { logo: 800, category: 1200 } as const;
export type AssetKind = keyof typeof ASSET_MAX_EDGE;

/** Public path prefix of every uploaded image; served by the Worker from R2 on every host. */
export const IMAGE_PATH_PREFIX = "/img/";

export function barAssetFolder(ownerId: string, barId: string): string {
  return `${ownerId}/${barId}/`;
}

export function assetPublicUrl(storageKey: string): string {
  return `${IMAGE_PATH_PREFIX}${storageKey}`;
}

/** All image URLs a bar configuration displays. */
export function configImageUrls(config: Pick<BarConfig, "logoUrl" | "categories">): string[] {
  return [config.logoUrl, ...config.categories.map((category) => category.image)].filter(Boolean);
}

/**
 * Only images uploaded for this bar may be shown, so a public calculator never loads third-party
 * content and the orphan cleanup can rely on every image belonging to exactly one bar.
 */
export function assertHostedImages(config: Pick<BarConfig, "logoUrl" | "categories">, folder: string): void {
  const prefix = IMAGE_PATH_PREFIX + folder;
  for (const url of configImageUrls(config)) {
    if (!url.startsWith(prefix) || url.includes("..") || url.includes("?") || url.includes("#")) {
      throw new UserError("Bilder müssen über den Barrechner hochgeladen werden.");
    }
  }
}

type AssetRow = { id: string; bar_id: string; storage_key: string; public_url: string };
type BarConfigRow = { bar_id: string; config: unknown };

/** Assets no draft or currently published revision of their bar refers to. */
export function unreferencedAssets<T extends AssetRow>(assets: T[], configs: BarConfigRow[]): T[] {
  const referenced = new Set<string>();
  for (const { bar_id, config } of configs) {
    if (!config || typeof config !== "object") continue;
    const value = config as Partial<BarConfig>;
    const urls = [value.logoUrl, ...(Array.isArray(value.categories) ? value.categories.map((category) => category?.image) : [])];
    for (const url of urls) if (typeof url === "string" && url) referenced.add(`${bar_id}\n${url}`);
  }
  return assets.filter((asset) => !referenced.has(`${asset.bar_id}\n${asset.public_url}`));
}
