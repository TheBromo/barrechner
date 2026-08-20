import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { signInAction } from "@/app/auth/actions";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if (await currentUser()) redirect("/dashboard");
  return <AuthForm mode="login" title="Willkommen zurück" subtitle="Melde dich an und bring deine Bar in wenigen Minuten auf den aktuellen Stand." submitLabel="Anmelden" action={signInAction} />;
}
