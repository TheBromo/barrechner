import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { signInAction } from "@/app/auth/actions";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  link: "Dieser Link ist ungültig oder abgelaufen. Melde dich an und fordere bei Bedarf einen neuen Link an.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ fehler?: string }> }) {
  if (await currentUser()) redirect("/dashboard");
  const { fehler } = await searchParams;
  return <AuthForm mode="login" title="Willkommen zurück" subtitle="Melde dich an und bring deine Bar in wenigen Minuten auf den aktuellen Stand." submitLabel="Anmelden" action={signInAction} notice={fehler ? NOTICES[fehler] : undefined} />;
}
