import { useState } from "react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { archiveBarById, getDashboard, restoreBarById } from "~/functions/bars";
import { tenantAddress, tenantUrl } from "~/lib/urls";
import { MAX_ACTIVE_BARS } from "~/lib/types";

export const Route = createFileRoute("/dashboard/")({
  loader: () => getDashboard(),
  component: DashboardPage,
});

function DashboardPage() {
  const { bars, origins } = Route.useLoaderData();
  const router = useRouter();
  const [error, setError] = useState("");
  const active = bars.filter((bar) => bar.status === "active");
  const archived = bars.filter((bar) => bar.status === "archived");
  const remaining = Math.max(0, MAX_ACTIVE_BARS - active.length);

  async function run(action: typeof archiveBarById, barId: string) {
    setError("");
    const result = await action({ data: { barId } });
    if (!result.ok) setError(result.error);
    await router.invalidate();
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow">Übersicht</p>
          <h1 className="mt-1 text-4xl font-black tracking-[-0.045em] text-slate-950">Deine Bars</h1>
          <p className="mt-2 text-slate-600">Noch {remaining} von {MAX_ACTIVE_BARS} Plätzen frei.</p>
        </div>
        {remaining > 0 && <Link to="/dashboard/bars/neu" className="primary-button">Neue Bar erstellen</Link>}
      </div>
      {error && <p role="alert" className="form-message error mt-6">{error}</p>}

      {active.length === 0 ? (
        <section className="empty-state mt-10">
          <span className="empty-icon">＋</span>
          <h2>Dein erster Rechner ist nur wenige Schritte entfernt.</h2>
          <p>Starte mit einer Beispielkarte und passe Namen, Preise und Farben an.</p>
          <Link to="/dashboard/bars/neu" className="primary-button mt-5">Erste Bar erstellen</Link>
        </section>
      ) : (
        <div className="mt-9 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {active.map((bar) => (
            <article key={bar.id} className="bar-card">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="status-pill">{bar.publishedRevision ? `Live · Version ${bar.publishedRevision}` : "Noch nicht veröffentlicht"}</p>
                  <h2 className="mt-4 text-2xl font-black text-slate-950">{bar.label}</h2>
                  <p className="mt-1 font-mono text-sm text-slate-500">{tenantAddress(origins, bar.slug)}</p>
                </div>
                <span className="bar-card-mark">{bar.label.slice(0, 1).toUpperCase()}</span>
              </div>
              <div className="mt-7 flex flex-wrap gap-2">
                <Link to="/dashboard/bars/$barId" params={{ barId: bar.id }} className="primary-button small">Bearbeiten</Link>
                {bar.publishedRevision && <a href={tenantUrl(origins, bar.slug)} target="_blank" rel="noreferrer" className="secondary-button small">Rechner öffnen</a>}
                <button className="text-button danger" onClick={() => window.confirm(`«${bar.label}» archivieren?`) && run(archiveBarById, bar.id)}>Archivieren</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <section className="mt-14">
          <h2 className="text-lg font-bold text-slate-950">Archiv</h2>
          <p className="mt-1 text-sm text-slate-500">Diese Bars werden nach 30 Tagen dauerhaft gelöscht.</p>
          <div className="mt-4 space-y-3">
            {archived.map((bar) => (
              <div key={bar.id} className="archive-row">
                <div><strong>{bar.label}</strong><span>{tenantAddress(origins, bar.slug)}</span></div>
                <button className="secondary-button small" onClick={() => run(restoreBarById, bar.id)}>Wiederherstellen</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
