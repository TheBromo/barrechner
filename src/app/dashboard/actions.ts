"use server";

import { randomUUID } from "crypto";
import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/log";
import { starterConfig } from "@/lib/seed";
import { normalizeSlug, validateSlug } from "@/lib/slug";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sanitizeBarConfig } from "@/lib/types";
import {
  BAR_IMPORT_BUCKET,
  MAX_IMPORT_BYTES,
  detectImportMime,
  extensionForImportMime,
  isImportMimeType,
  type ImportMimeType,
  type ImportProposal,
} from "@/lib/bar-import";
import { importBarCard } from "@/lib/mistral-import";

export type ActionState = { error?: string; success?: string } | null;
export type SaveResult = { ok: true } | { ok: false; error: string };
export type UploadResult = { url: string } | { error: string };
export type PrepareImportResult =
  | { ok: true; importId: string; path: string; token: string }
  | { ok: false; error: string };
export type ProcessImportResult =
  | { ok: true; proposal: ImportProposal }
  | { ok: false; error: string };

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unbekannter Fehler";
  if (message.includes("duplicate key") || message.includes("bars_slug_key")) return "Diese Adresse ist bereits vergeben.";
  return message;
}

async function ownedBarExists(barId: string, userId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("bars").select("id").eq("id", barId).eq("owner_id", userId).single();
  return Boolean(data);
}

export async function prepareBarImportAction(
  barId: string,
  metadata: { name: string; size: number; type: string },
): Promise<PrepareImportResult> {
  try {
    const user = await requireUser();
    if (!isImportMimeType(metadata.type)) throw new Error("Erlaubt sind PDF, PNG, JPEG und WebP.");
    if (!Number.isInteger(metadata.size) || metadata.size <= 0) throw new Error("Die Datei ist leer oder ungültig.");
    if (metadata.size > MAX_IMPORT_BYTES) throw new Error("Die Datei ist grösser als 10 MB.");
    if (!await ownedBarExists(barId, user.id)) throw new Error("Bar nicht gefunden.");

    const importId = randomUUID();
    const path = `${user.id}/${barId}/${importId}.${extensionForImportMime(metadata.type)}`;
    const admin = createSupabaseAdminClient();
    const { error: rowError } = await admin.from("bar_import_uploads").insert({
      id: importId,
      owner_id: user.id,
      bar_id: barId,
      storage_path: path,
      original_name: String(metadata.name ?? "Barkarte").trim().slice(0, 160) || "Barkarte",
      mime_type: metadata.type,
      byte_size: metadata.size,
      status: "pending",
    });
    if (rowError) throw rowError;

    const { data, error } = await admin.storage.from(BAR_IMPORT_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      await admin.from("bar_import_uploads").delete().eq("id", importId);
      throw error ?? new Error("Upload konnte nicht vorbereitet werden.");
    }
    return { ok: true, importId, path: data.path, token: data.token };
  } catch (error) {
    logError("bar.import.prepare", error, { barId });
    return { ok: false, error: errorMessage(error) };
  }
}

export async function processBarImportAction(barId: string, importId: string): Promise<ProcessImportResult> {
  let claimedPath = "";
  const admin = createSupabaseAdminClient();
  try {
    const user = await requireUser();
    await enforceRateLimit("bar-import", 10, 60 * 60);
    if (!await ownedBarExists(barId, user.id)) throw new Error("Bar nicht gefunden.");

    const { data: upload, error: claimError } = await admin
      .from("bar_import_uploads")
      .update({ status: "processing" })
      .eq("id", importId)
      .eq("bar_id", barId)
      .eq("owner_id", user.id)
      .eq("status", "pending")
      .select("storage_path,mime_type,byte_size")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!upload) throw new Error("Dieser Import wurde bereits verarbeitet oder ist abgelaufen.");
    claimedPath = upload.storage_path;

    const { data: file, error: downloadError } = await admin.storage.from(BAR_IMPORT_BUCKET).download(claimedPath);
    if (downloadError || !file) throw new Error("Die hochgeladene Datei konnte nicht gelesen werden.");
    if (file.size <= 0 || file.size > MAX_IMPORT_BYTES) throw new Error("Die Datei ist leer oder grösser als 10 MB.");
    if (file.size !== upload.byte_size) throw new Error("Die Dateigrösse stimmt nicht mit dem vorbereiteten Upload überein.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const detectedMime = detectImportMime(bytes);
    if (!detectedMime || detectedMime !== upload.mime_type || !isImportMimeType(upload.mime_type)) {
      throw new Error("Dateityp und Dateiinhalt stimmen nicht überein.");
    }

    const { data: signed, error: signedError } = await admin.storage.from(BAR_IMPORT_BUCKET).createSignedUrl(claimedPath, 5 * 60);
    if (signedError || !signed) throw new Error("Die Datei konnte nicht für OCR vorbereitet werden.");
    const proposal = await importBarCard(signed.signedUrl, detectedMime as ImportMimeType);
    return { ok: true, proposal };
  } catch (error) {
    logError("bar.import.process", error, { barId, importId });
    return { ok: false, error: errorMessage(error) };
  } finally {
    if (claimedPath) {
      const { error: storageError } = await admin.storage.from(BAR_IMPORT_BUCKET).remove([claimedPath]);
      if (storageError) logError("bar.import.cleanup.storage", storageError, { barId, importId });
      // Signed upload tokens live for two hours and cannot be revoked. Keep a tombstone
      // until the cleanup job removes it after token expiry, so the path cannot be processed twice.
      const { error: rowError } = await admin.from("bar_import_uploads").update({ status: "processing" }).eq("id", importId);
      if (rowError) logError("bar.import.cleanup.row", rowError, { barId, importId });
    }
  }
}

export async function cancelBarImportAction(barId: string, importId: string): Promise<void> {
  try {
    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("bar_import_uploads")
      .select("storage_path")
      .eq("id", importId)
      .eq("bar_id", barId)
      .eq("owner_id", user.id)
      .eq("status", "pending")
      .maybeSingle();
    if (!data) return;
    await admin.storage.from(BAR_IMPORT_BUCKET).remove([data.storage_path]);
    await admin.from("bar_import_uploads").update({ status: "processing" }).eq("id", importId).eq("owner_id", user.id);
  } catch (error) {
    logError("bar.import.cancel", error, { barId, importId });
  }
}

export async function createBarAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await enforceRateLimit("create-bar", 8, 60 * 60);
    await requireUser();
    const label = String(formData.get("name") ?? "").trim().slice(0, 80);
    if (!label) throw new Error("Bitte gib deiner Bar einen Namen.");
    const slug = validateSlug(String(formData.get("slug") ?? ""));
    const background = String(formData.get("background") ?? "#101a17");
    const accent = String(formData.get("accent") ?? "#f3ba45");
    const config = sanitizeBarConfig({ ...starterConfig(label), displayName: label, theme: { background, accent } });
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("create_bar", { p_slug: slug, p_label: label, p_config: config });
    if (error) throw error;
    redirect(`/dashboard/bars/${data}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    logError("bar.create", error);
    return { error: errorMessage(error) };
  }
}

export async function saveDraftAction(barId: string, configJson: string): Promise<SaveResult> {
  try {
    await requireUser();
    const config = sanitizeBarConfig(JSON.parse(configJson));
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("save_bar_draft", { p_bar_id: barId, p_label: config.displayName, p_config: config });
    if (error) throw error;
    revalidatePath(`/dashboard/bars/${barId}`);
    return { ok: true };
  } catch (error) {
    logError("bar.draft.save", error, { barId });
    return { ok: false, error: errorMessage(error) };
  }
}

export async function publishBarAction(barId: string): Promise<SaveResult> {
  try {
    await enforceRateLimit("publish-bar", 20, 60 * 60);
    await requireUser();
    const supabase = await createSupabaseServerClient();
    const { data: draft, error: draftError } = await supabase.from("bar_drafts").select("config").eq("bar_id", barId).single();
    if (draftError || !draft) throw new Error("Entwurf nicht gefunden.");
    sanitizeBarConfig(draft.config);
    const { error } = await supabase.rpc("publish_bar", { p_bar_id: barId });
    if (error) throw error;
    revalidatePath(`/dashboard/bars/${barId}`);
    return { ok: true };
  } catch (error) {
    logError("bar.publish", error, { barId });
    return { ok: false, error: errorMessage(error) };
  }
}

export async function discardDraftAction(barId: string): Promise<SaveResult> {
  try {
    await requireUser();
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("discard_bar_draft", { p_bar_id: barId });
    if (error) throw error;
    revalidatePath(`/dashboard/bars/${barId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function renameBarAction(barId: string, slugInput: string): Promise<SaveResult> {
  try {
    await requireUser();
    const slug = validateSlug(slugInput);
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("rename_bar", { p_bar_id: barId, p_slug: slug });
    if (error) throw error;
    revalidatePath(`/dashboard/bars/${barId}`);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function archiveBarAction(formData: FormData) {
  await requireUser();
  const barId = String(formData.get("barId") ?? "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("archive_bar", { p_bar_id: barId });
  if (error) throw new Error(errorMessage(error));
  revalidatePath("/dashboard");
}

export async function restoreBarAction(formData: FormData) {
  await requireUser();
  const barId = String(formData.get("barId") ?? "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("restore_bar", { p_bar_id: barId });
  if (error) throw new Error(errorMessage(error));
  revalidatePath("/dashboard");
}

export async function uploadAssetAction(barId: string, kind: "logo" | "category", formData: FormData): Promise<UploadResult> {
  try {
    await enforceRateLimit("upload", 40, 60 * 60);
    const user = await requireUser();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Keine Datei ausgewählt.");
    if (file.size > 4 * 1024 * 1024) throw new Error("Das Bild ist grösser als 4 MB.");
    if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(file.type)) {
      throw new Error("Erlaubt sind PNG, JPEG und WebP.");
    }
    const supabase = await createSupabaseServerClient();
    const { data: bar } = await supabase.from("bars").select("id").eq("id", barId).eq("owner_id", user.id).single();
    if (!bar) throw new Error("Bar nicht gefunden.");

    const input = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(input).metadata();
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > 24_000_000) {
      throw new Error("Das Bild hat ungültige oder zu grosse Abmessungen.");
    }
    const output = await sharp(input).rotate().resize({ width: kind === "logo" ? 800 : 1200, height: kind === "logo" ? 800 : 1200, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
    const path = `${user.id}/${barId}/${randomUUID()}.webp`;
    const admin = createSupabaseAdminClient();
    const { error: uploadError } = await admin.storage.from("bar-assets").upload(path, output, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
    if (uploadError) throw uploadError;
    const { data: publicUrl } = admin.storage.from("bar-assets").getPublicUrl(path);
    const { error: assetError } = await admin.from("assets").insert({ owner_id: user.id, bar_id: barId, storage_path: path, public_url: publicUrl.publicUrl, kind });
    if (assetError) {
      await admin.storage.from("bar-assets").remove([path]);
      throw assetError;
    }
    return { url: publicUrl.publicUrl };
  } catch (error) {
    logError("asset.upload", error, { barId, kind });
    return { error: errorMessage(error) };
  }
}

export async function normalizedSlugAction(input: string) {
  return normalizeSlug(input);
}
