import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { emailVerificationState } from "@/lib/email-verification";

export async function currentUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/anmelden?next=/dashboard");
  if (emailVerificationState(user).status === "required") redirect("/email-bestaetigen");
  return user;
}
