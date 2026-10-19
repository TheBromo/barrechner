import { unreferencedAssets } from "~/lib/assets";

const DAY_MS = 24 * 60 * 60 * 1000;
export const ARCHIVE_RETENTION_MS = 30 * DAY_MS;

async function deleteObjects(bucket: R2Bucket, keys: string[]) {
  for (let index = 0; index < keys.length; index += 1000) await bucket.delete(keys.slice(index, index + 1000));
}

/** Delete images that neither the draft nor the published version of their bar uses any more. */
async function removeOrphanedAssets(db: D1Database, bucket: R2Bucket, now: number): Promise<number> {
  // A day of slack keeps images uploaded into an unsaved draft until the owner saves.
  const { results: assets } = await db
    .prepare("SELECT id, bar_id, storage_key, public_url FROM assets WHERE created_at <= ? ORDER BY created_at ASC LIMIT 500")
    .bind(now - DAY_MS)
    .all<{ id: string; bar_id: string; storage_key: string; public_url: string }>();
  if (!assets.length) return 0;
  const barIds = [...new Set(assets.map((asset) => asset.bar_id))];
  const placeholders = barIds.map(() => "?").join(",");
  const { results: configs } = await db
    .prepare(
      `SELECT bar_id, config FROM bar_drafts WHERE bar_id IN (${placeholders})
       UNION ALL SELECT bars.id AS bar_id, bar_revisions.config FROM bars JOIN bar_revisions ON bar_revisions.id = bars.current_revision_id WHERE bars.id IN (${placeholders})`,
    )
    .bind(...barIds, ...barIds)
    .all<{ bar_id: string; config: string }>();
  const orphaned = unreferencedAssets(assets, configs.map((row) => ({ bar_id: row.bar_id, config: JSON.parse(row.config) })));
  if (!orphaned.length) return 0;
  await deleteObjects(bucket, orphaned.map((asset) => asset.storage_key));
  await db.batch(orphaned.map((asset) => db.prepare("DELETE FROM assets WHERE id = ?").bind(asset.id)));
  return orphaned.length;
}

/** Daily maintenance run by the Worker's Cron Trigger. */
export async function runCleanup(db: D1Database, bucket: R2Bucket, now = Date.now()) {
  const archiveCutoff = now - ARCHIVE_RETENTION_MS;
  // Stored files do not cascade with their rows, so remove them before the bars are deleted.
  const { results: expiredAssets } = await db
    .prepare("SELECT assets.storage_key FROM assets JOIN bars ON bars.id = assets.bar_id WHERE bars.status = 'archived' AND bars.archived_at <= ?")
    .bind(archiveCutoff)
    .all<{ storage_key: string }>();
  await deleteObjects(bucket, expiredAssets.map((row) => row.storage_key));

  const [, purgedBars] = await db.batch([
    db.prepare("DELETE FROM slug_redirects WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM bars WHERE status = 'archived' AND archived_at <= ?").bind(archiveCutoff),
    db.prepare("DELETE FROM rate_limits WHERE window_started_at <= ?").bind(now - DAY_MS),
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM email_tokens WHERE expires_at <= ?").bind(now - DAY_MS),
  ]);
  const removedOrphans = await removeOrphanedAssets(db, bucket, now);
  return { removedAssets: expiredAssets.length, purgedBars: purgedBars.meta.changes ?? 0, removedOrphans };
}
