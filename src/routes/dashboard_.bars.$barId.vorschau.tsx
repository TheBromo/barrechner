import { Link, createFileRoute } from "@tanstack/react-router";
import Calculator from "~/components/Calculator";
import { getDraftPreview } from "~/functions/public";

/** The calculator rendered from the draft, outside the dashboard layout. */
export const Route = createFileRoute("/dashboard_/bars/$barId/vorschau")({
  loader: ({ params }) => getDraftPreview({ data: { barId: params.barId } }),
  head: () => ({ meta: [{ title: "Entwurfsvorschau · Barrechner" }, { name: "robots", content: "noindex" }] }),
  component: PreviewPage,
});

function PreviewPage() {
  const { config } = Route.useLoaderData();
  const { barId } = Route.useParams();
  return (
    <div className="relative">
      <div className="preview-banner"><span>Entwurfsvorschau</span><Link to="/dashboard/bars/$barId" params={{ barId }}>Zurück zum Editor</Link></div>
      <Calculator menu={config} storageId={`preview-${barId}`} manageUrl="/dashboard" />
    </div>
  );
}
