import { useState, type FormEvent } from "react";
import { Link, createFileRoute, useHydrated } from "@tanstack/react-router";
import { DELETE_ACCOUNT_CONFIRMATION, deleteAccount } from "~/functions/auth";

export const Route = createFileRoute("/dashboard/konto")({
  head: () => ({ meta: [{ title: "Konto · Barrechner" }] }),
  component: AccountPage,
});

function AccountPage() {
  const { viewer } = Route.useRouteContext();
  const hydrated = useHydrated();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    const result = await deleteAccount({ data: { password: String(form.get("password") ?? ""), confirm: String(form.get("confirm") ?? "") } }).catch(() => ({ ok: false as const, error: "Das Konto konnte nicht gelöscht werden." }));
    if (result.ok) {
      window.location.assign("/konto-geloescht");
      return;
    }
    setError(result.error);
    setPending(false);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
      <p className="eyebrow">Konto</p>
      <h1 className="mt-1 text-4xl font-black tracking-[-0.045em] text-slate-950">Dein Konto</h1>
      <p className="mt-3 text-slate-600">Angemeldet als <strong>{viewer.email}</strong>.</p>

      <section className="editor-panel mt-8">
        <h2 className="text-lg font-bold text-slate-950">Passwort</h2>
        <p className="mt-1 text-sm text-slate-600">Ändere dein Passwort mit deinem aktuellen Passwort.</p>
        <Link to="/passwort-neu" className="secondary-button small mt-4">Passwort ändern</Link>
      </section>

      <section className="editor-panel mt-6">
        <h2 className="text-lg font-bold text-slate-950">Konto löschen</h2>
        <p className="mt-1 text-sm text-slate-600">
          Löscht dein Konto, alle Bars, Entwürfe, Versionen und hochgeladenen Bilder sofort und unwiderruflich.
          Die Rechner deiner Bars sind danach nicht mehr erreichbar.
        </p>
        <form method="post" onSubmit={onSubmit} className="mt-5 space-y-4">
          <label className="field-label">Passwort
            <input name="password" type="password" autoComplete="current-password" required className="field-input" />
          </label>
          <label className="field-label">Zur Bestätigung «{DELETE_ACCOUNT_CONFIRMATION}» eingeben
            <input name="confirm" required autoComplete="off" className="field-input" pattern={DELETE_ACCOUNT_CONFIRMATION} />
          </label>
          {error && <p role="alert" className="form-message error">{error}</p>}
          <button disabled={pending || !hydrated} className="primary-button bg-red-700">{pending ? "Wird gelöscht…" : "Konto endgültig löschen"}</button>
        </form>
      </section>
    </main>
  );
}
