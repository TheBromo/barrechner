import type { ReactNode } from "react";

export function StatusCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="platform-shell grid min-h-dvh place-items-center px-5 py-12">
      <section className="auth-card w-full max-w-md rounded-[2rem] p-7 sm:p-9">
        <div className="brand-mark mb-8">B</div>
        <h1 className="text-3xl font-black tracking-[-0.04em] text-slate-950">{title}</h1>
        {children}
      </section>
    </main>
  );
}
