import { ASSET_MAX_EDGE, MAX_ASSET_BYTES, type AssetKind } from "./assets";
import { UserError } from "./errors";

const ACCEPTED = new Set(["image/png", "image/jpeg", "image/webp"]);

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Downscale an image in the browser to the size the calculator needs and re-encode it as WebP
 * (PNG where the browser cannot encode WebP). Decoding and re-encoding also strips metadata.
 */
export async function prepareImage(file: File, kind: AssetKind): Promise<Blob> {
  if (!ACCEPTED.has(file.type)) throw new UserError("Erlaubt sind PNG, JPEG und WebP.");
  if (file.size > MAX_ASSET_BYTES) throw new UserError("Das Bild ist grösser als 4 MB.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new UserError("Das Bild konnte nicht gelesen werden.");
  }
  const scale = Math.min(1, ASSET_MAX_EDGE[kind] / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = await toBlob(canvas, "image/webp", 0.84);
  const blob = webp?.type === "image/webp" ? webp : await toBlob(canvas, "image/png");
  if (!blob) throw new UserError("Das Bild konnte nicht verarbeitet werden.");
  if (blob.size > MAX_ASSET_BYTES) throw new UserError("Das Bild ist grösser als 4 MB.");
  return blob;
}
