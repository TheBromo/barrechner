"use client";

import { useActionState } from "react";
import { deleteAccountAction } from "@/app/auth/actions";

export default function DeleteAccountForm({ confirmation }: { confirmation: string }) {
  const [state, formAction, pending] = useActionState(deleteAccountAction, null);
  return (
    <form action={formAction} className="mt-5 space-y-4">
      <label className="field-label">Passwort
        <input name="password" type="password" autoComplete="current-password" required className="field-input" />
      </label>
      <label className="field-label">Zur Bestätigung «{confirmation}» eingeben
        <input name="confirm" required autoComplete="off" className="field-input" pattern={confirmation} />
      </label>
      {state?.error && <p role="alert" className="form-message error">{state.error}</p>}
      <button disabled={pending} className="primary-button bg-red-700">{pending ? "Wird gelöscht…" : "Konto endgültig löschen"}</button>
    </form>
  );
}
