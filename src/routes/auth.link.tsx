import { useState } from "react";
import { Link, createFileRoute, useHydrated } from "@tanstack/react-router";
import { AuthShell } from "~/components/AuthForm";
import { consumeEmailLink } from "~/functions/auth";

/**
 * Landing page of emailed links. The single-use token is only redeemed on an explicit click, so
 * mail scanners that prefetch links cannot burn it, and it works on any device.
 */
export const Route = createFileRoute("/auth/link")({
  validateSearch: (search: Record<string, unknown>): { token: string; next?: string } => ({
    token: typeof search.token === "string" ? search.token : "",
    ...(typeof search.next === "string" ? { next: search.next } : {}),
  }),
  head: () => ({ meta: [{ title: "Link bestätigen · Barrechner" }, { name: "robots", content: "noindex" }, { name: "referrer", content: "no-referrer" }] }),
  component: EmailLinkPage,
});

function EmailLinkPage() {
  const { token, next } = Route.useSearch();
  const hydrated = useHydrated();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const resetLink = next === "/passwort-neu";

  async function confirm() {
    setPending(true);
    const result = await consumeEmailLink({ data: { token, next } }).catch(() => null);
    if (!result?.ok) {
      setFailed(true);
      setPending(false);
      return;
    }
    window.location.assign(result.next);
  }

  return (
    <AuthShell
      eyebrow="Barrechner.ch"
      title={resetLink ? "Neues Passwort festlegen" : "E-Mail-Adresse bestätigen"}
      subtitle={resetLink ? "Bestätige, dass du ein neues Passwort festlegen möchtest." : "Bestätige deine E-Mail-Adresse, um dein Konto ohne Frist weiter zu nutzen."}
    >
      {failed ? (
        <>
          <p role="alert" className="form-message error mt-7">Dieser Link ist ungültig oder abgelaufen. Melde dich an und fordere bei Bedarf einen neuen Link an.</p>
          <Link to={resetLink ? "/passwort-vergessen" : "/anmelden"} className="secondary-button mt-4 w-full">{resetLink ? "Neuen Link anfordern" : "Zur Anmeldung"}</Link>
        </>
      ) : (
        <button onClick={confirm} disabled={pending || !token || !hydrated} className="primary-button mt-7 w-full">{pending ? "Bitte warten…" : "Weiter"}</button>
      )}
    </AuthShell>
  );
}
