import { createFileRoute, useRouter } from "@tanstack/react-router";
import AdminEditor, { type EditorActions } from "~/components/AdminEditor";
import { barImageUploader } from "~/components/IconEditor";
import { discardBarDraft, getBarForEditor, importMenu, publishBar, renameBarSlug, saveDraft } from "~/functions/bars";
import { tenantUrl } from "~/lib/urls";

export const Route = createFileRoute("/dashboard/bars/$barId/")({
  loader: ({ params }) => getBarForEditor({ data: { barId: params.barId } }),
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.config.displayName ?? "Bar"} bearbeiten · Barrechner` }] }),
  component: EditBarPage,
});

function EditBarPage() {
  const { bar, config, publishedVersion, origins, importEnabled } = Route.useLoaderData();
  const router = useRouter();
  const barId = bar.id;
  const actions: EditorActions = {
    save: (next) => saveDraft({ data: { barId, config: next } }),
    publish: () => publishBar({ data: { barId } }),
    discard: () => discardBarDraft({ data: { barId } }),
    rename: (slug) => renameBarSlug({ data: { barId, slug } }),
    upload: barImageUploader(barId),
    importFile: (file) => {
      const data = new FormData();
      data.set("barId", barId);
      data.set("file", file);
      return importMenu({ data });
    },
    refresh: () => router.invalidate(),
  };
  return (
    <AdminEditor
      // Remount after saves and publishes so the form reflects what the server stored.
      key={`${config.updatedAt}:${publishedVersion ?? 0}:${bar.slug}`}
      menu={config}
      barId={barId}
      slug={bar.slug}
      publishedRevision={publishedVersion}
      liveUrl={tenantUrl(origins, bar.slug)}
      importEnabled={importEnabled}
      actions={actions}
    />
  );
}
