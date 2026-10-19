import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useHydrated } from "@tanstack/react-router";
import type { Result } from "~/lib/result";

type Props = {
  title: string;
  subtitle: string;
  submitLabel: string;
  mode: "login" | "signup" | "forgot" | "new-password";
  submit: (values: Record<string, string>) => Promise<Result<{ message?: string }>>;
  onSuccess?: () => void | Promise<void>;
  /** Ask for the current password when the session did not come from a fresh emailed link. */
  requireCurrentPassword?: boolean;
  /** Shown until the form is submitted, e.g. why the user was sent here. */
  notice?: string;
};

export function AuthShell({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: ReactNode; children: ReactNode }) {
  return (
    <main className="platform-shell grid min-h-dvh place-items-center px-5 py-12">
      <section className="auth-card w-full max-w-md rounded-[2rem] p-7 sm:p-9">
        <Link to="/" className="brand-mark mb-8 inline-flex" aria-label="Zur Startseite">B</Link>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950">{title}</h1>
        <div className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</div>
        {children}
      </section>
    </main>
  );
}

export default function AuthForm({ title, subtitle, submitLabel, mode, submit, onSuccess, requireCurrentPassword = false, notice }: Props) {
  const hydrated = useHydrated();
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<{ error?: string; success?: string } | null>(null);
  const passwordRequired = mode !== "forgot";
  const emailRequired = mode !== "new-password";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(Array.from(new FormData(event.currentTarget), ([key, value]) => [key, String(value)]));
    setPending(true);
    try {
      const result = await submit(values);
      if (!result.ok) setState({ error: result.error });
      else {
        setState(result.message ? { success: result.message } : null);
        await onSuccess?.();
      }
    } catch {
      setState({ error: "Die Anfrage ist fehlgeschlagen. Bitte versuche es erneut." });
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell eyebrow="Barrechner.ch" title={title} subtitle={subtitle}>
      <form method="post" onSubmit={onSubmit} className="mt-7 space-y-4">
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
        <button disabled={pending || !hydrated} className="primary-button w-full">{pending ? "Bitte warten…" : submitLabel}</button>
      </form>
      <div className="auth-links">
        {mode === "login" && <><Link to="/registrieren">Konto erstellen</Link><Link to="/passwort-vergessen">Passwort vergessen?</Link></>}
        {mode === "signup" && <Link to="/anmelden">Bereits registriert?</Link>}
        {mode === "forgot" && <Link to="/anmelden">Zur Anmeldung</Link>}
        {mode === "new-password" && <Link to="/dashboard">Zurück zur Übersicht</Link>}
      </div>
    </AuthShell>
  );
}
