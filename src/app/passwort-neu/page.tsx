import AuthForm from "@/components/AuthForm";
import { updatePasswordAction } from "@/app/auth/actions";

export default function NewPasswordPage() {
  return <AuthForm mode="new-password" title="Neues Passwort" subtitle="Wähle ein neues Passwort für dein Barrechner-Konto." submitLabel="Passwort speichern" action={updatePasswordAction} />;
}
