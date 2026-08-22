import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/log";
import { BAR_IMPORT_BUCKET } from "@/lib/bar-import";

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
      const { error: storageError } = await supabase.storage.from("bar-assets").remove(paths);
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
    return NextResponse.json({ ok: true, removedAssets: paths.length, removedImports: importPaths.length });
  } catch (error) {
    logError("cleanup.failed", error);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
