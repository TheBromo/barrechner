import type { BarConfig } from "./types";

export const BAR_ASSETS_BUCKET = "bar-assets";
export const MAX_ASSET_BYTES = 4 * 1024 * 1024;

export function assetUrlPrefix(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${BAR_ASSETS_BUCKET}/`;
}

/** All image URLs a bar configuration displays. */
export function configImageUrls(config: Pick<BarConfig, "logoUrl" | "categories">): string[] {
  return [config.logoUrl, ...config.categories.map((category) => category.image)].filter(Boolean);
}

export function barAssetFolder(ownerId: string, barId: string): string {
  return `${ownerId}/${barId}/`;
}

/**
 * Only images uploaded for this bar may be shown, so a public calculator never loads third-party
 * content and the orphan cleanup can rely on every image belonging to exactly one bar.
 */
export function assertHostedImages(
  config: Pick<BarConfig, "logoUrl" | "categories">,
  supabaseUrl: string,
  folder: string,
): void {
  const prefix = assetUrlPrefix(supabaseUrl) + folder;
  for (const url of configImageUrls(config)) {
    if (!url.startsWith(prefix) || url.includes("..") || url.includes("?") || url.includes("#")) {
      throw new Error("Bilder müssen über den Barrechner hochgeladen werden.");
    }
  }
}

type AssetRow = { id: string; bar_id: string; storage_path: string; public_url: string };
type BarConfigs = { bar_id: string; config: unknown };

/** Assets no draft or currently published revision of their bar refers to. */
export function unreferencedAssets(assets: AssetRow[], configs: BarConfigs[]): AssetRow[] {
  const referenced = new Set<string>();
  for (const { bar_id, config } of configs) {
    if (!config || typeof config !== "object") continue;
    const value = config as Partial<BarConfig>;
    const urls = [value.logoUrl, ...(Array.isArray(value.categories) ? value.categories.map((category) => category?.image) : [])];
    for (const url of urls) if (typeof url === "string" && url) referenced.add(`${bar_id}\n${url}`);
  }
  return assets.filter((asset) => !referenced.has(`${asset.bar_id}\n${asset.public_url}`));
}
