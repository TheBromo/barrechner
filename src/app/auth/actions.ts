"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DELETE_ACCOUNT_CONFIRMATION, currentUser, sessionFromRecentEmailLink, verifyPassword } from "@/lib/auth";
import { BAR_ASSETS_BUCKET } from "@/lib/assets";
import { BAR_IMPORT_BUCKET } from "@/lib/bar-import";
import { userMessage } from "@/lib/errors";
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
    unstable_rethrow(error);
    logError("auth.sign_in", error);
    return { error: userMessage(error, "Anmeldung fehlgeschlagen.") };
  }
  redirect("/dashboard");
}

export async function signUpAction(_state: AuthState, formData: FormData): Promise<AuthState> {
  try {
    await enforceRateLimit("signup", 5, 60 * 60);
    const { email, password } = credentials(formData);
    const origin = platformOrigin();
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
      if (createError?.code === "weak_password") return { error: "Dieses Passwort ist zu schwach. Bitte wähle ein anderes." };
      throw createError ?? new Error("Das Konto konnte nicht erstellt werden.");
    }

    const supabase = await createSupabaseServerClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;

    const { error: emailError } = await sendEmailVerification(email, origin);
    if (emailError) logError("auth.verification_email", emailError);
  } catch (error) {
    unstable_rethrow(error);
    logError("auth.sign_up", error);
    return { error: userMessage(error, "Registrierung fehlgeschlagen.") };
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
    const { error } = await sendEmailVerification(data.user.email, platformOrigin());
    if (error) throw error;
  } catch (error) {
    unstable_rethrow(error);
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
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${platformOrigin()}/auth/callback?next=/passwort-neu&verify_email=1`,
    });
    if (error) throw error;
    return { success: "Falls ein Konto existiert, haben wir einen Link gesendet." };
  } catch (error) {
    unstable_rethrow(error);
    logError("auth.password_reset_request", error);
    return { error: userMessage(error, "Anfrage fehlgeschlagen.") };
  }
}

export async function updatePasswordAction(_state: AuthState, formData: FormData): Promise<AuthState> {
  try {
    await enforceRateLimit("password-update", 6, 60 * 60);
    const password = String(formData.get("password") ?? "");
    if (password.length < 8) throw new Error("Das Passwort muss mindestens 8 Zeichen lang sein.");
    const user = await currentUser();
    if (!user?.email) throw new Error("Der Link ist abgelaufen. Bitte fordere einen neuen an.");
    // Without a fresh reset link, a stolen session alone must not be enough to take over the account.
    if (!await sessionFromRecentEmailLink()) {
      const currentPassword = String(formData.get("currentPassword") ?? "");
      if (!await verifyPassword(user.email, currentPassword)) throw new Error("Das aktuelle Passwort ist falsch.");
    }
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      if (error.code === "same_password") return { error: "Das neue Passwort muss sich vom bisherigen unterscheiden." };
      if (error.code === "weak_password") return { error: "Dieses Passwort ist zu schwach. Bitte wähle ein anderes." };
      throw error;
    }
  } catch (error) {
    unstable_rethrow(error);
    logError("auth.password_update", error);
    return { error: userMessage(error, "Passwort konnte nicht geändert werden.") };
  }
  redirect("/dashboard");
}

async function removeStorageObjects(bucket: string, paths: string[]) {
  const admin = createSupabaseAdminClient();
  for (let index = 0; index < paths.length; index += 500) {
    const { error } = await admin.storage.from(bucket).remove(paths.slice(index, index + 500));
    if (error) throw error;
  }
}

export async function deleteAccountAction(_state: AuthState, formData: FormData): Promise<AuthState> {
  try {
    await enforceRateLimit("delete-account", 5, 60 * 60);
    const user = await currentUser();
    if (!user?.email) redirect("/anmelden");
    if (String(formData.get("confirm") ?? "").trim() !== DELETE_ACCOUNT_CONFIRMATION) {
      throw new Error(`Bitte gib zur Bestätigung «${DELETE_ACCOUNT_CONFIRMATION}» ein.`);
    }
    if (!await verifyPassword(user.email, String(formData.get("password") ?? ""))) {
      throw new Error("Das Passwort ist falsch.");
    }

    const admin = createSupabaseAdminClient();
    const [assets, imports] = await Promise.all([
      admin.from("assets").select("storage_path").eq("owner_id", user.id),
      admin.from("bar_import_uploads").select("storage_path").eq("owner_id", user.id),
    ]);
    if (assets.error) throw assets.error;
    if (imports.error) throw imports.error;
    // Database rows cascade with the user; stored files do not, so remove them first.
    await removeStorageObjects(BAR_ASSETS_BUCKET, (assets.data ?? []).map((row) => row.storage_path));
    await removeStorageObjects(BAR_IMPORT_BUCKET, (imports.data ?? []).map((row) => row.storage_path));

    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch (error) {
    unstable_rethrow(error);
    logError("auth.delete_account", error);
    return { error: userMessage(error, "Das Konto konnte nicht gelöscht werden.") };
  }
  redirect("/konto-geloescht");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
