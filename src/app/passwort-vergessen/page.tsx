import AuthForm from "@/components/AuthForm";
import { requestPasswordResetAction } from "@/app/auth/actions";

export default function ForgotPasswordPage() {
  return <AuthForm mode="forgot" title="Passwort zurücksetzen" subtitle="Wir senden dir einen sicheren Link zum Festlegen eines neuen Passworts." submitLabel="Link senden" action={requestPasswordResetAction} />;
}
