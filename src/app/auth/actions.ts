"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/log";

export type AuthState = { error?: string; success?: string } | null;

function credentials(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Bitte eine gültige E-Mail-Adresse eingeben.");
  if (password.length < 8) throw new Error("Das Passwort muss mindestens 8 Zeichen lang sein.");
  return { email, password };
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
    const origin = (await headers()).get("origin") ?? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "barrechner.ch"}`;
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${origin}/auth/callback?next=/dashboard` },
    });
    if (error) throw error;
    return { success: "Fast geschafft: Bitte bestätige deine E-Mail-Adresse." };
  } catch (error) {
    logError("auth.sign_up", error);
    return { error: error instanceof Error ? error.message : "Registrierung fehlgeschlagen." };
  }
}

export async function requestPasswordResetAction(_state: AuthState, formData: FormData): Promise<AuthState> {
  try {
    await enforceRateLimit("password-reset", 4, 60 * 60);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Bitte eine gültige E-Mail-Adresse eingeben.");
    const origin = (await headers()).get("origin") ?? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "barrechner.ch"}`;
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/passwort-neu` });
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
