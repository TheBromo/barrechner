"use client";

import Link from "next/link";

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="platform-shell grid min-h-dvh place-items-center px-5 py-12">
      <section className="auth-card w-full max-w-md rounded-[2rem] p-7 sm:p-9">
        <div className="brand-mark mb-8">B</div>
        <h1 className="text-3xl font-black tracking-[-0.04em] text-slate-950">Etwas ist schiefgelaufen</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Die Aktion konnte nicht abgeschlossen werden. Bitte versuche es erneut.</p>
        <div className="mt-7 grid gap-3">
          <button onClick={() => retry()} className="primary-button w-full">Erneut versuchen</button>
          <Link href="/dashboard" className="secondary-button w-full">Zur Übersicht</Link>
        </div>
      </section>
    </main>
  );
}
