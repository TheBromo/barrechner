"use client";

import "./globals.css";

export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="de-CH">
      <body className="min-h-full">
        <title>Fehler · Barrechner</title>
        <main className="platform-shell grid min-h-dvh place-items-center px-5 py-12">
          <section className="auth-card w-full max-w-md rounded-[2rem] p-7 sm:p-9">
            <h1 className="text-3xl font-black tracking-[-0.04em] text-slate-950">Etwas ist schiefgelaufen</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">Bitte lade die Seite neu oder versuche es später erneut.</p>
            <button onClick={() => retry()} className="primary-button mt-7 w-full">Erneut versuchen</button>
          </section>
        </main>
      </body>
    </html>
  );
}
