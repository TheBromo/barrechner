import AuthForm from "@/components/AuthForm";
import { signUpAction } from "@/app/auth/actions";

export default function RegisterPage() {
  return <AuthForm mode="signup" title="Deine erste Bar" subtitle="Kostenlos registrieren, Karte einrichten und die Adresse mit deinem Team teilen." submitLabel="Konto erstellen" action={signUpAction} />;
}
