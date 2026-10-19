import { Link, createFileRoute } from "@tanstack/react-router";
import { StatusCard } from "~/components/StatusCard";

export const Route = createFileRoute("/konto-geloescht")({
  component: () => (
    <StatusCard title="Konto gelöscht">
      <p className="mt-3 text-sm leading-6 text-slate-600">Dein Konto und alle zugehörigen Daten wurden entfernt.</p>
      <Link to="/" className="secondary-button mt-7 w-full">Zur Startseite</Link>
    </StatusCard>
  ),
});
