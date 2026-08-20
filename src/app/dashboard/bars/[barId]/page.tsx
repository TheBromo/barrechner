import AdminEditor from "@/components/AdminEditor";
import { getOwnedBar } from "@/lib/data";

export default async function EditBarPage({ params }: { params: Promise<{ barId: string }> }) {
  const { barId } = await params;
  const { bar, config, publishedVersion } = await getOwnedBar(barId);
  return <AdminEditor key={`${config.updatedAt}:${publishedVersion ?? 0}`} menu={config} barId={barId} slug={bar.slug} publishedRevision={publishedVersion} />;
}
