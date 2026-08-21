"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/log";
import { platformOrigin } from "@/lib/urls";
import {
  EMAIL_VERIFICATION_REQUIRED_BY_KEY,
  emailVerificationRequiredBy,
} from "@/lib/email-verification";

export type AuthState = { error?: string; success?: string } | null;

function credentials(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Bitte eine gültige E-Mail-Adresse eingeben.");
  if (password.length < 8) throw new Error("Das Passwort muss mindestens 8 Zeichen lang sein.");
  return { email, password };
}

async function sendEmailVerification(email: string, origin: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${origin}/auth/callback?next=/dashboard&verify_email=1`,
    },
  });
}

export async function signInAction(_state: AuthState, formData: FormData): Promise<AuthState> {
  try {
    await enforceRateLimit("login", 8, 15 * 60);
    const { email, password } = credentials(formData);
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: "E-Mail-Adresse oder Passwort ist falsch." };
  } catch (error) {
    logError("auth.sign_in", error);
    return { error: error instanceof Error ? error.message : "Anmeldung fehlgeschlagen." };
  }
  redirect("/dashboard");
}

export async function signUpAction(_state: AuthState, formData: FormData): Promise<AuthState> {
  try {
    await enforceRateLimit("signup", 5, 60 * 60);
    const { email, password } = credentials(formData);
    const origin = (await headers()).get("origin") ?? platformOrigin();
    const admin = createSupabaseAdminClient();
    const requiredBy = emailVerificationRequiredBy(new Date().toISOString()).toISOString();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { [EMAIL_VERIFICATION_REQUIRED_BY_KEY]: requiredBy },
    });
    if (createError || !created.user) {
      if (createError?.code === "email_exists" || createError?.code === "user_already_exists") {
        return { error: "Für diese E-Mail-Adresse besteht bereits ein Konto." };
      }
      throw createError ?? new Error("Das Konto konnte nicht erstellt werden.");
    }

    const supabase = await createSupabaseServerClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;

    const { error: emailError } = await sendEmailVerification(email, origin);
    if (emailError) logError("auth.verification_email", emailError);
  } catch (error) {
    logError("auth.sign_up", error);
    return { error: error instanceof Error ? error.message : "Registrierung fehlgeschlagen." };
  }
  redirect("/dashboard");
}

export async function resendEmailVerificationAction() {
  let destination = "/email-bestaetigen?status=gesendet";
  try {
    await enforceRateLimit("email-verification", 4, 60 * 60);
    const supabase = await createSupabaseServerClient();
    const { data, error: userError } = await supabase.auth.getUser();
    if (userError || !data.user?.email) redirect("/anmelden");
    const origin = (await headers()).get("origin") ?? platformOrigin();
    const { error } = await sendEmailVerification(data.user.email, origin);
    if (error) throw error;
  } catch (error) {
    logError("auth.verification_resend", error);
    destination = "/email-bestaetigen?status=fehler";
  }
  redirect(destination);
}

export async function requestPasswordResetAction(_state: AuthState, formData: FormData): Promise<AuthState> {
  try {
    await enforceRateLimit("password-reset", 4, 60 * 60);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Bitte eine gültige E-Mail-Adresse eingeben.");
    const origin = (await headers()).get("origin") ?? platformOrigin();
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/passwort-neu&verify_email=1`,
    });
    if (error) throw error;
    return { success: "Falls ein Konto existiert, haben wir einen Link gesendet." };
  } catch (error) {
    logError("auth.password_reset_request", error);
    return { error: error instanceof Error ? error.message : "Anfrage fehlgeschlagen." };
  }
}

export async function updatePasswordAction(_state: AuthState, formData: FormData): Promise<AuthState> {
  try {
    const password = String(formData.get("password") ?? "");
    if (password.length < 8) throw new Error("Das Passwort muss mindestens 8 Zeichen lang sein.");
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Passwort konnte nicht geändert werden." };
  }
  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
