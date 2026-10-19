import { createFileRoute } from "@tanstack/react-router";
import NewBarForm from "~/components/NewBarForm";
import { getDashboard } from "~/functions/bars";

export const Route = createFileRoute("/dashboard/bars/neu")({
  loader: async () => (await getDashboard()).origins,
  head: () => ({ meta: [{ title: "Neue Bar · Barrechner" }] }),
  component: NewBarPage,
});

function NewBarPage() {
  const origins = Route.useLoaderData();
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
      <p className="eyebrow">Neue Bar</p>
      <h1 className="mt-1 text-4xl font-black tracking-[-0.045em] text-slate-950">Name, Adresse, los.</h1>
      <p className="mt-3 max-w-xl text-slate-600">Die Webadresse ist weltweit eindeutig. Den sichtbaren Namen und alle Inhalte kannst du später ändern.</p>
      <NewBarForm origins={origins} />
    </main>
  );
}
