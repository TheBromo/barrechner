import { useState } from "react";
import { Link, createFileRoute, redirect, useHydrated, useRouter } from "@tanstack/react-router";
import { AuthShell } from "~/components/AuthForm";
import { getViewer, resendVerification, signOut } from "~/functions/auth";
import { formatSwissDate } from "~/lib/email-verification";

export const Route = createFileRoute("/email-bestaetigen")({
  beforeLoad: async () => {
    const viewer = await getViewer();
    if (!viewer) throw redirect({ to: "/anmelden" });
    if (viewer.verification.status === "verified") throw redirect({ to: "/dashboard" });
    return { viewer };
  },
  loader: ({ context }) => context.viewer,
  head: () => ({ meta: [{ title: "E-Mail bestätigen · Barrechner" }] }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const viewer = Route.useLoaderData();
  const router = useRouter();
  const hydrated = useHydrated();
  const [status, setStatus] = useState<"idle" | "pending" | "sent" | "error">("idle");
  const { verification } = viewer;

  async function resend() {
    setStatus("pending");
    const result = await resendVerification().catch(() => ({ ok: false as const, error: "" }));
    setStatus(result.ok ? "sent" : "error");
  }

  return (
    <AuthShell
      eyebrow="E-Mail bestätigen"
      title="Prüfe deinen Posteingang"
      subtitle={<p>
        Wir haben einen Bestätigungslink an <strong>{viewer.email}</strong> gesendet.
        {verification.status === "grace"
          ? ` Dein Konto funktioniert noch bis am ${formatSwissDate(verification.requiredBy)}.`
          : " Deine 30-tägige Frist ist abgelaufen; nach der Bestätigung kannst du sofort weiterarbeiten."}
      </p>}
    >
      {status === "sent" && <p role="status" className="form-message success mt-5">Ein neuer Link wurde gesendet.</p>}
      {status === "error" && <p role="alert" className="form-message error mt-5">Der Link konnte nicht gesendet werden. Bitte versuche es erneut.</p>}
      <div className="mt-7 grid gap-3">
        <button onClick={resend} disabled={status === "pending" || !hydrated} className="primary-button w-full">Bestätigungslink senden</button>
        {verification.status === "grace" && <Link to="/dashboard" className="secondary-button w-full">Später bestätigen</Link>}
        <button className="text-button w-full" onClick={async () => { await signOut(); await router.navigate({ to: "/" }); }}>Abmelden</button>
      </div>
    </AuthShell>
  );
}
