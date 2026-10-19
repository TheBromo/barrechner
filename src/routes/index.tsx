import { createFileRoute } from "@tanstack/react-router";
import Calculator from "~/components/Calculator";
import Landing from "~/components/Landing";
import { getHome } from "~/functions/public";

const STATUS_COPY = {
  archived: ["Diese Bar ist archiviert.", "Der Rechner ist zurzeit nicht verfügbar."],
  unpublished: ["Diese Bar wird gerade eingerichtet.", "Sobald die Getränkekarte veröffentlicht ist, erscheint hier der Rechner."],
  missing: ["Bar nicht gefunden.", "Prüfe die eingegebene Webadresse."],
} as const;

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { bar?: string } => (typeof search.bar === "string" ? { bar: search.bar } : {}),
  loaderDeps: ({ search }) => ({ bar: search.bar ?? "" }),
  loader: ({ deps }) => getHome({ data: deps }),
  head: ({ loaderData }) => {
    if (loaderData?.kind !== "tenant") return {};
    if (loaderData.result.kind !== "published") return { meta: [{ title: "Barrechner" }, { name: "robots", content: "noindex, nofollow" }] };
    const name = loaderData.result.config.displayName;
    return {
      meta: [
        { title: name },
        { name: "description", content: `Preisrechner für ${name}` },
        { name: "application-name", content: name },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-title", content: name },
        { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
        { name: "theme-color", content: loaderData.result.config.theme.background },
      ],
    };
  },
  component: Home,
});

function Home() {
  const home = Route.useLoaderData();
  if (home.kind === "platform") return <Landing />;
  const { result } = home;
  if (result.kind === "published") {
    return <Calculator menu={result.config} storageId={home.slug} manageUrl={`${home.origins.platform}/dashboard`} offline={home.offline} />;
  }
  const [title, text] = STATUS_COPY[result.kind];
  return (
    <main className="tenant-status">
      <span className="brand-mark">B</span>
      <h1>{title}</h1>
      <p>{text}</p>
      <a href={home.origins.platform}>Zu barrechner.ch</a>
    </main>
  );
}
