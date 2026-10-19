import Link from "next/link";
import DeleteAccountForm from "@/components/DeleteAccountForm";
import { DELETE_ACCOUNT_CONFIRMATION, requireUser } from "@/lib/auth";

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
      <p className="eyebrow">Konto</p>
      <h1 className="mt-1 text-4xl font-black tracking-[-0.045em] text-slate-950">Dein Konto</h1>
      <p className="mt-3 text-slate-600">Angemeldet als <strong>{user.email}</strong>.</p>

      <section className="editor-panel mt-8">
        <h2 className="text-lg font-bold text-slate-950">Passwort</h2>
        <p className="mt-1 text-sm text-slate-600">Ändere dein Passwort mit deinem aktuellen Passwort.</p>
        <Link href="/passwort-neu" className="secondary-button small mt-4">Passwort ändern</Link>
      </section>

      <section className="editor-panel mt-6">
        <h2 className="text-lg font-bold text-slate-950">Konto löschen</h2>
        <p className="mt-1 text-sm text-slate-600">
          Löscht dein Konto, alle Bars, Entwürfe, Versionen und hochgeladenen Bilder sofort und unwiderruflich.
          Die Rechner deiner Bars sind danach nicht mehr erreichbar.
        </p>
        <DeleteAccountForm confirmation={DELETE_ACCOUNT_CONFIRMATION} />
      </section>
    </main>
  );
}
