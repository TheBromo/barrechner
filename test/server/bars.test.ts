import { beforeEach, describe, expect, it } from "vitest";
import { createTestD1 } from "../d1";
import { createTestR2 } from "../r2";
import { createUser } from "~/backend/accounts";
import {
  archiveBar, createBar, discardDraft, getOwnedBar, getPublicBar, isSlugAvailable, listOwnedBars, publishBar,
  recordAsset, renameBar, restoreBar, saveDraft, SLUG_REDIRECT_TTL_MS,
} from "~/backend/bars";
import { runCleanup, ARCHIVE_RETENTION_MS } from "~/backend/cleanup";
import { starterConfig } from "~/lib/seed";

let db: D1Database;
let owner: string;
let other: string;
beforeEach(async () => {
  db = createTestD1();
  owner = (await createUser(db, "owner@example.ch", "passwort1")).id;
  other = (await createUser(db, "other@example.ch", "passwort1")).id;
});

describe("bar lifecycle", () => {
  it("creates a bar with a draft and lists it unpublished", async () => {
    const id = await createBar(db, owner, "sommerbar", starterConfig("Sommerbar"));
    const bars = await listOwnedBars(db, owner);
    expect(bars).toMatchObject([{ id, slug: "sommerbar", label: "Sommerbar", status: "active", publishedRevision: null }]);
    expect((await getOwnedBar(db, owner, id))?.config.categories).toHaveLength(3);
    expect(await getOwnedBar(db, other, id)).toBeNull();
    expect(await getPublicBar(db, "sommerbar")).toEqual({ kind: "unpublished" });
  });
  it("allows at most five active bars and unique slugs", async () => {
    for (let index = 0; index < 5; index += 1) await createBar(db, owner, `bar-${index}`, starterConfig());
    await expect(createBar(db, owner, "bar-6", starterConfig())).rejects.toThrow("Maximal fünf aktive Bars");
    await expect(createBar(db, other, "bar-1", starterConfig())).rejects.toThrow("UNIQUE constraint failed: bars.slug");
    expect(await isSlugAvailable(db, "bar-1")).toBe(false);
    expect(await isSlugAvailable(db, "frei")).toBe(true);
  });
  it("only the owner may save; publish numbers versions and stamps them", async () => {
    const id = await createBar(db, owner, "sommerbar", starterConfig("Sommerbar"));
    await expect(saveDraft(db, other, id, starterConfig("Hack"))).rejects.toThrow("Bar nicht gefunden");
    await saveDraft(db, owner, id, starterConfig("Sommerbar 2"));
    expect(await publishBar(db, owner, id, Date.parse("2026-10-01T00:00:00Z"))).toBe(1);
    expect(await publishBar(db, owner, id)).toBe(2);
    await expect(publishBar(db, other, id)).rejects.toThrow("nicht gefunden");
    const published = await getPublicBar(db, "sommerbar");
    expect(published).toMatchObject({ kind: "published", config: { displayName: "Sommerbar 2", revision: 2 } });
    const owned = await getOwnedBar(db, owner, id);
    expect(owned?.publishedVersion).toBe(2);
    expect(owned?.config.revision).toBe(2);
    expect((await listOwnedBars(db, owner))[0]).toMatchObject({ label: "Sommerbar 2", publishedRevision: 2 });
  });
  it("discarding restores the published version", async () => {
    const id = await createBar(db, owner, "sommerbar", starterConfig("Sommerbar"));
    await expect(discardDraft(db, owner, id)).rejects.toThrow("Noch keine veröffentlichte Version");
    await publishBar(db, owner, id);
    await saveDraft(db, owner, id, starterConfig("Entwurf"));
    await discardDraft(db, owner, id);
    expect((await getOwnedBar(db, owner, id))?.config.displayName).toBe("Sommerbar");
    expect((await listOwnedBars(db, owner))[0].label).toBe("Sommerbar");
  });
  it("renaming keeps a 30-day redirect that reserves the old slug for this bar only", async () => {
    const now = 1_000_000;
    const id = await createBar(db, owner, "alt", starterConfig(), now);
    await publishBar(db, owner, id, now);
    await renameBar(db, owner, id, "neu", now);
    expect(await getPublicBar(db, "alt", now)).toEqual({ kind: "redirect", slug: "neu" });
    expect(await getPublicBar(db, "neu", now)).toMatchObject({ kind: "published" });
    await expect(createBar(db, other, "alt", starterConfig(), now)).rejects.toThrow("vorübergehend reserviert");
    expect(await isSlugAvailable(db, "alt", null, now)).toBe(false);
    // The bar itself may move back to its previous address.
    await renameBar(db, owner, id, "alt", now + 1);
    expect(await getPublicBar(db, "alt", now + 1)).toMatchObject({ kind: "published", slug: "alt" });
    expect(await getPublicBar(db, "neu", now + 1)).toEqual({ kind: "redirect", slug: "alt" });
    // After expiry the old address is free again.
    expect(await getPublicBar(db, "neu", now + 1 + SLUG_REDIRECT_TTL_MS)).toEqual({ kind: "missing" });
  });
  it("rejects renames onto taken or reserved slugs", async () => {
    const first = await createBar(db, owner, "erste", starterConfig());
    await createBar(db, other, "zweite", starterConfig());
    await expect(renameBar(db, owner, first, "zweite")).rejects.toThrow("bereits vergeben");
    const third = await createBar(db, other, "dritte", starterConfig());
    await renameBar(db, other, third, "vierte");
    await expect(renameBar(db, owner, first, "dritte")).rejects.toThrow("vorübergehend reserviert");
    await expect(renameBar(db, other, first, "fuenfte")).rejects.toThrow("nicht gefunden");
  });
  it("archives and restores only while a slot is free", async () => {
    const ids = [];
    for (let index = 0; index < 5; index += 1) ids.push(await createBar(db, owner, `bar-${index}`, starterConfig()));
    await archiveBar(db, owner, ids[0]);
    expect(await getPublicBar(db, "bar-0")).toEqual({ kind: "archived" });
    await createBar(db, owner, "bar-5", starterConfig());
    await expect(restoreBar(db, owner, ids[0])).rejects.toThrow("Platz frei");
    await archiveBar(db, owner, ids[1]);
    await restoreBar(db, owner, ids[0]);
    await expect(restoreBar(db, owner, ids[0])).rejects.toThrow("Archivierte Bar nicht gefunden");
    await expect(archiveBar(db, other, ids[2])).rejects.toThrow("nicht gefunden");
  });
});

describe("daily cleanup", () => {
  it("purges old archives with their images, expired redirects and orphaned uploads", async () => {
    const bucket = createTestR2();
    const day = 24 * 60 * 60 * 1000;
    const start = 10 * day;
    const archived = await createBar(db, owner, "archiv", starterConfig(), start);
    const live = await createBar(db, owner, "live", starterConfig(), start);
    for (const [barId, key] of [[archived, "a.webp"], [live, "used.webp"], [live, "orphan.webp"]] as const) {
      const storageKey = `${owner}/${barId}/${key}`;
      await bucket.put(storageKey, new Uint8Array([1]));
      await recordAsset(db, { ownerId: owner, barId, storageKey, publicUrl: `/img/${storageKey}`, kind: "logo" }, start);
    }
    const config = { ...starterConfig(), logoUrl: `/img/${owner}/${live}/used.webp` };
    await saveDraft(db, owner, live, config, start);
    await renameBar(db, owner, live, "live-neu", start);
    await archiveBar(db, owner, archived, start);

    const result = await runCleanup(db, bucket, start + ARCHIVE_RETENTION_MS + day);
    expect(result).toEqual({ removedAssets: 1, purgedBars: 1, removedOrphans: 1 });
    expect([...bucket.objects.keys()]).toEqual([`${owner}/${live}/used.webp`]);
    expect(await getPublicBar(db, "live", start + ARCHIVE_RETENTION_MS + day)).toEqual({ kind: "missing" });
    expect(await getOwnedBar(db, owner, archived)).toBeNull();
  });
});
