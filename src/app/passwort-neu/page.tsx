import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { updatePasswordAction } from "@/app/auth/actions";
import { currentUser, sessionFromRecentEmailLink } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewPasswordPage() {
  if (!await currentUser()) redirect("/passwort-vergessen");
  const fromResetLink = await sessionFromRecentEmailLink();
  return <AuthForm mode="new-password" title="Neues Passwort" subtitle="Wähle ein neues Passwort für dein Barrechner-Konto." submitLabel="Passwort speichern" action={updatePasswordAction} requireCurrentPassword={!fromResetLink} />;
}
