import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/log";
import { BAR_IMPORT_BUCKET } from "@/lib/bar-import";
import { BAR_ASSETS_BUCKET, unreferencedAssets } from "@/lib/assets";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

/** Delete uploads that neither the draft nor the published version of their bar uses any more. */
async function removeOrphanedAssets(supabase: SupabaseAdmin): Promise<number> {
  // Leave a day of slack so images uploaded into an unsaved draft survive until the owner saves.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: assets, error: assetError } = await supabase
    .from("assets")
    .select("id,bar_id,storage_path,public_url")
    .lte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(500);
  if (assetError) throw assetError;
  if (!assets?.length) return 0;

  const barIds = [...new Set(assets.map((asset) => asset.bar_id))];
  const [drafts, bars] = await Promise.all([
    supabase.from("bar_drafts").select("bar_id,config").in("bar_id", barIds),
    supabase.from("bars").select("id,current_revision_id").in("id", barIds),
  ]);
  if (drafts.error) throw drafts.error;
  if (bars.error) throw bars.error;
  const revisionIds = (bars.data ?? []).map((bar) => bar.current_revision_id).filter((id): id is string => Boolean(id));
  const revisions = revisionIds.length
    ? await supabase.from("bar_revisions").select("bar_id,config").in("id", revisionIds)
    : { data: [], error: null };
  if (revisions.error) throw revisions.error;

  const orphaned = unreferencedAssets(assets, [...(drafts.data ?? []), ...(revisions.data ?? [])]);
  if (!orphaned.length) return 0;
  const { error: storageError } = await supabase.storage.from(BAR_ASSETS_BUCKET).remove(orphaned.map((asset) => asset.storage_path));
  if (storageError) throw storageError;
  const { error: deleteError } = await supabase.from("assets").delete().in("id", orphaned.map((asset) => asset.id));
  if (deleteError) throw deleteError;
  return orphaned.length;
}

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const supabase = createSupabaseAdminClient();
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: expiredAssets, error: assetQueryError } = await supabase
      .from("assets")
      .select("storage_path,bars!inner(status,archived_at)")
      .eq("bars.status", "archived")
      .lte("bars.archived_at", cutoff);
    if (assetQueryError) throw assetQueryError;
    const paths = (expiredAssets ?? []).map((row: { storage_path: string }) => row.storage_path).filter(Boolean);
    if (paths.length) {
      const { error: storageError } = await supabase.storage.from(BAR_ASSETS_BUCKET).remove(paths);
      if (storageError) throw storageError;
    }
    const importCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: staleImports, error: importQueryError } = await supabase
      .from("bar_import_uploads")
      .select("id,storage_path")
      .lte("created_at", importCutoff);
    if (importQueryError) throw importQueryError;
    const importPaths = (staleImports ?? []).map((row: { storage_path: string }) => row.storage_path).filter(Boolean);
    if (importPaths.length) {
      const { error: importStorageError } = await supabase.storage.from(BAR_IMPORT_BUCKET).remove(importPaths);
      if (importStorageError) throw importStorageError;
      const importIds = (staleImports ?? []).map((row: { id: string }) => row.id);
      const { error: importExpireError } = await supabase.from("bar_import_uploads").update({ status: "processing" }).in("id", importIds);
      if (importExpireError) throw importExpireError;
    }
    const tokenExpiryCutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const { error: importDeleteError } = await supabase.from("bar_import_uploads").delete().lte("created_at", tokenExpiryCutoff);
    if (importDeleteError) throw importDeleteError;
    const { error } = await supabase.rpc("purge_expired_data");
    if (error) throw error;
    const removedOrphans = await removeOrphanedAssets(supabase);
    return NextResponse.json({ ok: true, removedAssets: paths.length, removedOrphans, removedImports: importPaths.length });
  } catch (error) {
    logError("cleanup.failed", error);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
