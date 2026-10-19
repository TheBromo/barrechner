import "server-only";
import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { publicSupabaseEnv } from "@/lib/env";
import { emailVerificationState } from "@/lib/email-verification";
import { hasRecentEmailLinkLogin } from "@/lib/reauth";

export const DELETE_ACCOUNT_CONFIRMATION = "LÖSCHEN";

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

/** Whether the current session came from a password-reset or login link sent moments ago. */
export async function sessionFromRecentEmailLink(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  return hasRecentEmailLinkLogin(data?.claims?.amr);
}

/** Check a password without touching the caller's session cookies. */
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  if (!email || !password) return false;
  const { url, publishableKey } = publicSupabaseEnv();
  const client = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  return !error;
}
