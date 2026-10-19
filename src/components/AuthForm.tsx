"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthState } from "@/app/auth/actions";

type Props = {
  title: string;
  subtitle: string;
  submitLabel: string;
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  mode: "login" | "signup" | "forgot" | "new-password";
  /** Ask for the current password when the session did not come from a fresh reset link. */
  requireCurrentPassword?: boolean;
  /** Shown until the form is submitted, e.g. why the user was sent here. */
  notice?: string;
};

export default function AuthForm({ title, subtitle, submitLabel, action, mode, requireCurrentPassword = false, notice }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const passwordRequired = mode === "login" || mode === "signup" || mode === "new-password";
  const emailRequired = mode !== "new-password";

  return (
    <main className="platform-shell grid min-h-dvh place-items-center px-5 py-12">
      <section className="auth-card w-full max-w-md rounded-[2rem] p-7 sm:p-9">
        <Link href="/" className="brand-mark mb-8 inline-flex" aria-label="Zur Startseite">B</Link>
        <p className="eyebrow">Barrechner.ch</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>

        <form action={formAction} className="mt-7 space-y-4">
          {emailRequired && (
            <label className="field-label">E-Mail-Adresse
              <input name="email" type="email" autoComplete="email" required className="field-input" placeholder="du@beispiel.ch" />
            </label>
          )}
          {requireCurrentPassword && (
            <label className="field-label">Aktuelles Passwort
              <input name="currentPassword" type="password" autoComplete="current-password" required className="field-input" />
            </label>
          )}
          {passwordRequired && (
            <label className="field-label">{mode === "new-password" ? "Neues Passwort" : "Passwort"}
              <input name="password" type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} required className="field-input" placeholder="Mindestens 8 Zeichen" />
            </label>
          )}
          {!state && notice && <p role="alert" className="form-message error">{notice}</p>}
          {state?.error && <p role="alert" className="form-message error">{state.error}</p>}
          {state?.success && <p role="status" className="form-message success">{state.success}</p>}
          <button disabled={pending} className="primary-button w-full">{pending ? "Bitte warten…" : submitLabel}</button>
        </form>

        <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600">
          {mode === "login" && <><Link href="/registrieren">Konto erstellen</Link><Link href="/passwort-vergessen">Passwort vergessen?</Link></>}
          {mode === "signup" && <Link href="/anmelden">Bereits registriert?</Link>}
          {mode === "forgot" && <Link href="/anmelden">Zur Anmeldung</Link>}
          {mode === "new-password" && <Link href="/dashboard">Zurück zur Übersicht</Link>}
        </div>
      </section>
    </main>
  );
}
