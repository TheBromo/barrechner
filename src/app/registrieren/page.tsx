import AuthForm from "@/components/AuthForm";
import { signUpAction } from "@/app/auth/actions";

export default function RegisterPage() {
  return <AuthForm mode="signup" title="Deine erste Bar" subtitle="Kostenlos registrieren und sofort loslegen. Du hast 30 Tage Zeit, deine E-Mail-Adresse zu bestätigen." submitLabel="Konto erstellen" action={signUpAction} />;
}
