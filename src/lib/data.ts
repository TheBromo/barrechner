import "server-only";
import { notFound } from "next/navigation";
import type { BarConfig, BarSummary } from "@/lib/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PublicBarRow = {
  id: string;
  slug: string;
  status: "active" | "archived";
  archived_at: string | null;
  current_revision_id: string | null;
};

type RevisionRow = { config: BarConfig; version: number };

export async function listOwnedBars(): Promise<BarSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bars")
    .select("id,slug,label,status,archived_at,updated_at,current_revision:bar_revisions!bars_current_revision_id_fkey(version)")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Bars konnten nicht geladen werden: ${error.message}`);
  return (data ?? []).map((row: Record<string, unknown>) => {
    const revision = Array.isArray(row.current_revision) ? row.current_revision[0] : row.current_revision;
    return {
      id: String(row.id),
      slug: String(row.slug),
      label: String(row.label),
      status: row.status as "active" | "archived",
      archivedAt: (row.archived_at as string | null) ?? null,
      publishedRevision: revision && typeof revision === "object" ? Number((revision as { version?: number }).version) : null,
      updatedAt: String(row.updated_at),
    };
  });
}

export async function getOwnedBar(barId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: bar, error } = await supabase
    .from("bars")
    .select("id,slug,label,status,archived_at,current_revision_id,updated_at")
    .eq("id", barId)
    .single();
  if (error || !bar) notFound();

  const { data: draft, error: draftError } = await supabase
    .from("bar_drafts")
    .select("config,updated_at")
    .eq("bar_id", barId)
    .single();
  if (draftError || !draft) throw new Error("Der Entwurf konnte nicht geladen werden.");

  let publishedVersion: number | null = null;
  if (bar.current_revision_id) {
    const { data: revision } = await supabase
      .from("bar_revisions")
      .select("version")
      .eq("id", bar.current_revision_id)
      .single();
    publishedVersion = revision?.version ?? null;
  }

  return { bar, config: draft.config as BarConfig, publishedVersion };
}

export type PublicBarResult =
  | { kind: "published"; slug: string; config: BarConfig }
  | { kind: "redirect"; slug: string }
  | { kind: "unpublished" }
  | { kind: "archived" }
  | { kind: "missing" };

export async function getPublicBar(slug: string): Promise<PublicBarResult> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("bars")
    .select("id,slug,status,archived_at,current_revision_id")
    .eq("slug", slug)
    .maybeSingle<PublicBarRow>();

  if (!data) {
    const { data: redirectRow } = await supabase
      .from("slug_redirects")
      .select("bar:bars!inner(slug,status)")
      .eq("old_slug", slug)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    const target = redirectRow?.bar as unknown as { slug: string; status: string } | null;
    return target?.status === "active" ? { kind: "redirect", slug: target.slug } : { kind: "missing" };
  }
  if (data.status === "archived") return { kind: "archived" };
  if (!data.current_revision_id) return { kind: "unpublished" };

  const { data: revision, error } = await supabase
    .from("bar_revisions")
    .select("config,version")
    .eq("id", data.current_revision_id)
    .single<RevisionRow>();
  if (error || !revision) return { kind: "unpublished" };
  return {
    kind: "published",
    slug: data.slug,
    config: { ...revision.config, revision: revision.version },
  };
}
