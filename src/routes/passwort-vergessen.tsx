import { createFileRoute } from "@tanstack/react-router";
import AuthForm from "~/components/AuthForm";
import { requestPasswordReset } from "~/functions/auth";

export const Route = createFileRoute("/passwort-vergessen")({
  head: () => ({ meta: [{ title: "Passwort zurücksetzen · Barrechner" }] }),
  component: () => (
    <AuthForm
      mode="forgot"
      title="Passwort zurücksetzen"
      subtitle="Wir senden dir einen sicheren Link zum Festlegen eines neuen Passworts."
      submitLabel="Link senden"
      submit={(values) => requestPasswordReset({ data: values })}
    />
  ),
});
