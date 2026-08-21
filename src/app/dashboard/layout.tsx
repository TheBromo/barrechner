import { requireUser } from "@/lib/auth";
import DashboardHeader from "@/components/DashboardHeader";
import { emailVerificationState } from "@/lib/email-verification";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const verification = emailVerificationState(user);
  return <div className="min-h-dvh bg-[#f5f3ec]">
    <DashboardHeader email={user.email ?? ""} />
    {verification.status === "grace" && (
      <div className="border-b border-amber-300 bg-amber-100 px-5 py-3 text-center text-sm text-amber-950">
        Bitte bestätige deine E-Mail-Adresse bis am {verification.requiredBy.toLocaleDateString("de-CH")}.
        {" "}<a className="font-extrabold underline" href="/email-bestaetigen">Bestätigungslink erneut senden</a>
      </div>
    )}
    {children}
  </div>;
}
