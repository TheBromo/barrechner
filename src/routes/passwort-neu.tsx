import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import AuthForm from "~/components/AuthForm";
import { getViewer, updatePassword } from "~/functions/auth";

export const Route = createFileRoute("/passwort-neu")({
  beforeLoad: async () => {
    const viewer = await getViewer();
    if (!viewer) throw redirect({ to: "/passwort-vergessen" });
    return { viewer };
  },
  loader: ({ context }) => ({ requireCurrentPassword: !context.viewer.fromRecentEmailLink }),
  head: () => ({ meta: [{ title: "Neues Passwort · Barrechner" }] }),
  component: NewPasswordPage,
});

function NewPasswordPage() {
  const { requireCurrentPassword } = Route.useLoaderData();
  const router = useRouter();
  return (
    <AuthForm
      mode="new-password"
      title="Neues Passwort"
      subtitle="Wähle ein neues Passwort für dein Barrechner-Konto."
      submitLabel="Passwort speichern"
      requireCurrentPassword={requireCurrentPassword}
      submit={(values) => updatePassword({ data: values })}
      onSuccess={() => router.navigate({ to: "/dashboard" })}
    />
  );
}
