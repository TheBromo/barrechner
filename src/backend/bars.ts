import { UserError } from "~/lib/errors";
import { MAX_ACTIVE_BARS, type BarConfig, type BarSummary } from "~/lib/types";

export const SLUG_REDIRECT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type BarRow = {
  id: string;
  owner_id: string;
  slug: string;
  label: string;
  status: "active" | "archived";
  archived_at: number | null;
  current_revision_id: string | null;
  created_at: number;
  updated_at: number;
};

export type OwnedBar = { bar: BarRow; config: BarConfig; publishedVersion: number | null };

const activeCount = "(SELECT COUNT(*) FROM bars WHERE owner_id = ?1 AND status = 'active')";

export async function listOwnedBars(db: D1Database, ownerId: string): Promise<BarSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT bars.*, bar_revisions.version AS published_version FROM bars
       LEFT JOIN bar_revisions ON bar_revisions.id = bars.current_revision_id
       WHERE bars.owner_id = ? ORDER BY bars.created_at ASC`,
    )
    .bind(ownerId)
    .all<BarRow & { published_version: number | null }>();
  return results.map((row) => ({
    id: row.id,
    slug: row.slug,
    label: row.label,
    status: row.status,
    archivedAt: row.archived_at,
    publishedRevision: row.published_version,
    updatedAt: row.updated_at,
  }));
}

export async function getOwnedBar(db: D1Database, ownerId: string, barId: string): Promise<OwnedBar | null> {
  const row = await db
    .prepare(
      `SELECT bars.*, bar_drafts.config AS draft_config, bar_revisions.version AS published_version FROM bars
       JOIN bar_drafts ON bar_drafts.bar_id = bars.id
       LEFT JOIN bar_revisions ON bar_revisions.id = bars.current_revision_id
       WHERE bars.id = ? AND bars.owner_id = ?`,
    )
    .bind(barId, ownerId)
    .first<BarRow & { draft_config: string; published_version: number | null }>();
  if (!row) return null;
  const { draft_config, published_version, ...bar } = row;
  return { bar, config: JSON.parse(draft_config) as BarConfig, publishedVersion: published_version };
}

export async function ownsBar(db: D1Database, ownerId: string, barId: string): Promise<boolean> {
  return Boolean(await db.prepare("SELECT 1 AS ok FROM bars WHERE id = ? AND owner_id = ?").bind(barId, ownerId).first("ok"));
}

/** A slug is free when no bar uses it and no other bar holds a live redirect from it. */
export async function isSlugAvailable(db: D1Database, slug: string, forBarId: string | null = null, now = Date.now()): Promise<boolean> {
  const taken = await db
    .prepare(
      `SELECT 1 AS taken FROM bars WHERE slug = ?1 AND id IS NOT ?2
       UNION ALL SELECT 1 FROM slug_redirects WHERE old_slug = ?1 AND expires_at > ?3 AND bar_id IS NOT ?2 LIMIT 1`,
    )
    .bind(slug, forBarId, now)
    .first("taken");
  return !taken;
}

export async function createBar(db: D1Database, ownerId: string, slug: string, config: BarConfig, now = Date.now()): Promise<string> {
  const id = crypto.randomUUID();
  // Both statements run in one transaction; the guarded INSERT enforces the slot limit and
  // redirect reservations atomically, the draft only follows if the bar row was written.
  const [insert] = await db.batch([
    db
      .prepare(
        `INSERT INTO bars (id, owner_id, slug, label, status, created_at, updated_at)
         SELECT ?2, ?1, ?3, ?4, 'active', ?5, ?5
         WHERE ${activeCount} < ?6
           AND NOT EXISTS (SELECT 1 FROM slug_redirects WHERE old_slug = ?3 AND expires_at > ?5)`,
      )
      .bind(ownerId, id, slug, config.displayName, now, MAX_ACTIVE_BARS),
    db.prepare("INSERT INTO bar_drafts (bar_id, config, updated_at) SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM bars WHERE id = ?1)").bind(id, JSON.stringify(config), now),
  ]);
  if (!insert.meta.changes) {
    const count = await db.prepare("SELECT COUNT(*) AS count FROM bars WHERE owner_id = ? AND status = 'active'").bind(ownerId).first<number>("count");
    if ((count ?? 0) >= MAX_ACTIVE_BARS) throw new UserError("Maximal fünf aktive Bars sind erlaubt.");
    throw new UserError("Diese Adresse ist vorübergehend reserviert.");
  }
  return id;
}

export async function saveDraft(db: D1Database, ownerId: string, barId: string, config: BarConfig, now = Date.now()) {
  const [update] = await db.batch([
    db.prepare("UPDATE bars SET label = ?3, updated_at = ?4 WHERE id = ?1 AND owner_id = ?2").bind(barId, ownerId, config.displayName, now),
    db
      .prepare("UPDATE bar_drafts SET config = ?3, updated_at = ?4 WHERE bar_id = ?1 AND EXISTS (SELECT 1 FROM bars WHERE id = ?1 AND owner_id = ?2)")
      .bind(barId, ownerId, JSON.stringify(config), now),
  ]);
  if (!update.meta.changes) throw new UserError("Bar nicht gefunden.");
}

export async function publishBar(db: D1Database, ownerId: string, barId: string, now = Date.now()): Promise<number> {
  const revisionId = crypto.randomUUID();
  const updatedAt = new Date(now).toISOString();
  const guard = "EXISTS (SELECT 1 FROM bars WHERE id = ?1 AND owner_id = ?2 AND status = 'active')";
  // One transaction: number the next version, stamp it into the config, point the bar at it,
  // and write the stamped config back to the draft so editor and calculator agree.
  const [insert] = await db.batch([
    db
      .prepare(
        `INSERT INTO bar_revisions (id, bar_id, version, config, created_by, created_at)
         SELECT ?3, ?1, next.version, json_set(bar_drafts.config, '$.revision', next.version, '$.updatedAt', ?4), ?2, ?5
         FROM bar_drafts, (SELECT COALESCE(MAX(version), 0) + 1 AS version FROM bar_revisions WHERE bar_id = ?1) AS next
         WHERE bar_drafts.bar_id = ?1 AND ${guard}`,
      )
      .bind(barId, ownerId, revisionId, updatedAt, now),
    db.prepare(`UPDATE bars SET current_revision_id = ?3, updated_at = ?4 WHERE id = ?1 AND owner_id = ?2 AND EXISTS (SELECT 1 FROM bar_revisions WHERE id = ?3)`).bind(barId, ownerId, revisionId, now),
    db.prepare(`UPDATE bar_drafts SET config = (SELECT config FROM bar_revisions WHERE id = ?2), updated_at = ?3 WHERE bar_id = ?1 AND EXISTS (SELECT 1 FROM bar_revisions WHERE id = ?2)`).bind(barId, revisionId, now),
  ]);
  if (!insert.meta.changes) throw new UserError("Bar nicht gefunden oder archiviert.");
  const version = await db.prepare("SELECT version FROM bar_revisions WHERE id = ?").bind(revisionId).first<number>("version");
  return version ?? 0;
}

export async function discardDraft(db: D1Database, ownerId: string, barId: string, now = Date.now()) {
  const published = await db
    .prepare(`SELECT bar_revisions.config FROM bars JOIN bar_revisions ON bar_revisions.id = bars.current_revision_id WHERE bars.id = ? AND bars.owner_id = ?`)
    .bind(barId, ownerId)
    .first<string>("config");
  if (!published) throw new UserError("Noch keine veröffentlichte Version vorhanden.");
  const displayName = (JSON.parse(published) as BarConfig).displayName;
  await db.batch([
    db.prepare("UPDATE bar_drafts SET config = ?2, updated_at = ?3 WHERE bar_id = ?1").bind(barId, published, now),
    db.prepare("UPDATE bars SET label = ?2, updated_at = ?3 WHERE id = ?1").bind(barId, displayName, now),
  ]);
}

export async function renameBar(db: D1Database, ownerId: string, barId: string, slug: string, now = Date.now()) {
  const current = await db.prepare("SELECT slug FROM bars WHERE id = ? AND owner_id = ? AND status = 'active'").bind(barId, ownerId).first<string>("slug");
  if (!current) throw new UserError("Bar nicht gefunden.");
  if (current === slug) return;
  if (!(await isSlugAvailable(db, slug, barId, now))) {
    const used = await db.prepare("SELECT 1 AS used FROM bars WHERE slug = ?").bind(slug).first("used");
    throw new UserError(used ? "Diese Adresse ist bereits vergeben." : "Diese Adresse ist vorübergehend reserviert.");
  }
  const renamed = "EXISTS (SELECT 1 FROM bars WHERE id = ?1 AND slug = ?2)";
  // The guarded UPDATE re-checks every precondition inside the transaction; the redirect
  // bookkeeping only happens when it actually moved the bar.
  const [update] = await db.batch([
    db
      .prepare(
        `UPDATE bars SET slug = ?2, updated_at = ?4 WHERE id = ?1 AND owner_id = ?5 AND status = 'active' AND slug = ?3
         AND NOT EXISTS (SELECT 1 FROM slug_redirects WHERE old_slug = ?2 AND expires_at > ?4 AND bar_id <> ?1)`,
      )
      .bind(barId, slug, current, now, ownerId),
    // Moving back to one of the bar's own previous addresses removes that redirect.
    db.prepare(`DELETE FROM slug_redirects WHERE old_slug = ?2 AND ${renamed}`).bind(barId, slug),
    db
      .prepare(
        `INSERT INTO slug_redirects (old_slug, bar_id, expires_at) SELECT ?3, ?1, ?4 WHERE ${renamed}
         ON CONFLICT (old_slug) DO UPDATE SET bar_id = excluded.bar_id, expires_at = excluded.expires_at`,
      )
      .bind(barId, slug, current, now + SLUG_REDIRECT_TTL_MS),
  ]);
  if (!update.meta.changes) throw new UserError("Die Adresse konnte nicht geändert werden. Bitte versuche es erneut.");
}

export async function archiveBar(db: D1Database, ownerId: string, barId: string, now = Date.now()) {
  const result = await db
    .prepare("UPDATE bars SET status = 'archived', archived_at = ?3, updated_at = ?3 WHERE id = ?1 AND owner_id = ?2 AND status = 'active'")
    .bind(barId, ownerId, now)
    .run();
  if (!result.meta.changes) throw new UserError("Bar nicht gefunden.");
}

export async function restoreBar(db: D1Database, ownerId: string, barId: string, now = Date.now()) {
  const result = await db
    .prepare(
      `UPDATE bars SET status = 'active', archived_at = NULL, updated_at = ?3
       WHERE id = ?2 AND owner_id = ?1 AND status = 'archived' AND ${activeCount} < ?4`,
    )
    .bind(ownerId, barId, now, MAX_ACTIVE_BARS)
    .run();
  if (result.meta.changes) return;
  const archived = await db.prepare("SELECT 1 AS ok FROM bars WHERE id = ? AND owner_id = ? AND status = 'archived'").bind(barId, ownerId).first("ok");
  throw new UserError(archived ? "Für die Wiederherstellung muss ein Platz frei sein." : "Archivierte Bar nicht gefunden.");
}

export type PublicBarResult =
  | { kind: "published"; slug: string; config: BarConfig }
  | { kind: "redirect"; slug: string }
  | { kind: "unpublished" }
  | { kind: "archived" }
  | { kind: "missing" };

export async function getPublicBar(db: D1Database, slug: string, now = Date.now()): Promise<PublicBarResult> {
  const row = await db
    .prepare(
      `SELECT bars.slug, bars.status, bar_revisions.config, bar_revisions.version FROM bars
       LEFT JOIN bar_revisions ON bar_revisions.id = bars.current_revision_id WHERE bars.slug = ?`,
    )
    .bind(slug)
    .first<{ slug: string; status: string; config: string | null; version: number | null }>();
  if (!row) {
    const target = await db
      .prepare(`SELECT bars.slug FROM slug_redirects JOIN bars ON bars.id = slug_redirects.bar_id WHERE slug_redirects.old_slug = ? AND slug_redirects.expires_at > ? AND bars.status = 'active'`)
      .bind(slug, now)
      .first<string>("slug");
    return target ? { kind: "redirect", slug: target } : { kind: "missing" };
  }
  if (row.status === "archived") return { kind: "archived" };
  if (!row.config || row.version == null) return { kind: "unpublished" };
  return { kind: "published", slug: row.slug, config: { ...(JSON.parse(row.config) as BarConfig), revision: row.version } };
}

export async function recordAsset(db: D1Database, asset: { ownerId: string; barId: string; storageKey: string; publicUrl: string; kind: "logo" | "category" }, now = Date.now()) {
  await db
    .prepare("INSERT INTO assets (id, owner_id, bar_id, storage_key, public_url, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), asset.ownerId, asset.barId, asset.storageKey, asset.publicUrl, asset.kind, now)
    .run();
}

export async function ownedAssetKeys(db: D1Database, ownerId: string): Promise<string[]> {
  const { results } = await db.prepare("SELECT storage_key FROM assets WHERE owner_id = ?").bind(ownerId).all<{ storage_key: string }>();
  return results.map((row) => row.storage_key);
}
