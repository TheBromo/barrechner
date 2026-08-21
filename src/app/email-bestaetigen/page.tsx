import { redirect } from "next/navigation";
import { resendEmailVerificationAction, signOutAction } from "@/app/auth/actions";
import { currentUser } from "@/lib/auth";
import { emailVerificationState } from "@/lib/email-verification";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/anmelden");
  const verification = emailVerificationState(user);
  if (verification.status === "verified") redirect("/dashboard");
  const { status } = await searchParams;

  return (
    <main className="platform-shell grid min-h-dvh place-items-center px-5 py-12">
      <section className="auth-card w-full max-w-md rounded-[2rem] p-7 sm:p-9">
        <div className="brand-mark mb-8">B</div>
        <p className="eyebrow">E-Mail bestätigen</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950">Prüfe deinen Posteingang</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Wir haben einen Bestätigungslink an <strong>{user.email}</strong> gesendet.
          {verification.status === "grace"
            ? ` Dein Konto funktioniert noch bis am ${verification.requiredBy.toLocaleDateString("de-CH")}.`
            : " Deine 30-tägige Frist ist abgelaufen; nach der Bestätigung kannst du sofort weiterarbeiten."}
        </p>
        {status === "gesendet" && <p role="status" className="form-message success mt-5">Ein neuer Link wurde gesendet.</p>}
        {status === "fehler" && <p role="alert" className="form-message error mt-5">Der Link konnte nicht gesendet oder bestätigt werden. Bitte versuche es erneut.</p>}
        <div className="mt-7 grid gap-3">
          <form action={resendEmailVerificationAction}><button className="primary-button w-full">Bestätigungslink senden</button></form>
          {verification.status === "grace" && <a href="/dashboard" className="secondary-button w-full">Später bestätigen</a>}
          <form action={signOutAction}><button className="text-button w-full">Abmelden</button></form>
        </div>
      </section>
    </main>
  );
}
