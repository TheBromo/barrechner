import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import AuthForm from "~/components/AuthForm";
import { getViewer, signIn } from "~/functions/auth";

const NOTICES: Record<string, string> = {
  link: "Dieser Link ist ungültig oder abgelaufen. Melde dich an und fordere bei Bedarf einen neuen Link an.",
};

export const Route = createFileRoute("/anmelden")({
  validateSearch: (search: Record<string, unknown>): { fehler?: string } => (typeof search.fehler === "string" ? { fehler: search.fehler } : {}),
  beforeLoad: async () => {
    if (await getViewer()) throw redirect({ to: "/dashboard" });
  },
  head: () => ({ meta: [{ title: "Anmelden · Barrechner" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { fehler } = Route.useSearch();
  const router = useRouter();
  return (
    <AuthForm
      mode="login"
      title="Willkommen zurück"
      subtitle="Melde dich an und bring deine Bar in wenigen Minuten auf den aktuellen Stand."
      submitLabel="Anmelden"
      notice={fehler ? NOTICES[fehler] : undefined}
      submit={(values) => signIn({ data: values })}
      onSuccess={() => router.navigate({ to: "/dashboard" })}
    />
  );
}
