import Link from "next/link";

export default function NotFound() {
  return (
    <main className="platform-shell grid min-h-dvh place-items-center px-5 py-12">
      <section className="auth-card w-full max-w-md rounded-[2rem] p-7 sm:p-9">
        <div className="brand-mark mb-8">B</div>
        <h1 className="text-3xl font-black tracking-[-0.04em] text-slate-950">Seite nicht gefunden</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Prüfe die eingegebene Webadresse.</p>
        <Link href="/" className="secondary-button mt-7 w-full">Zur Startseite</Link>
      </section>
    </main>
  );
}
