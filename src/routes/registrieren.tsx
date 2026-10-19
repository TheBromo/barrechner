import { createFileRoute, useRouter } from "@tanstack/react-router";
import AuthForm from "~/components/AuthForm";
import { signUp } from "~/functions/auth";

export const Route = createFileRoute("/registrieren")({
  head: () => ({ meta: [{ title: "Registrieren · Barrechner" }] }),
  component: RegisterPage,
});

function RegisterPage() {
  const router = useRouter();
  return (
    <AuthForm
      mode="signup"
      title="Deine erste Bar"
      subtitle="Kostenlos registrieren und sofort loslegen. Du hast 30 Tage Zeit, deine E-Mail-Adresse zu bestätigen."
      submitLabel="Konto erstellen"
      submit={(values) => signUp({ data: values })}
      onSuccess={() => router.navigate({ to: "/dashboard" })}
    />
  );
}
