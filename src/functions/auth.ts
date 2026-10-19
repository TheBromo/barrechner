import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import {
  authenticate, changePassword, checkPassword, consumeEmailToken, createEmailToken, createSession, createUser,
  deleteSession, deleteUser, findUserByEmail, markEmailVerified, normalizeEmail, validatePassword,
} from "~/backend/accounts";
import { attempt } from "~/backend/attempt.server";
import { ownedAssetKeys } from "~/backend/bars";
import { clearSessionCookie, currentSession, db, images, origins, rateLimit, requireSession, sessionToken, setSessionCookie } from "~/backend/context.server";
import { sha256Hex } from "~/backend/crypto";
import { passwordResetEmail, sendEmail, verificationEmail } from "~/backend/email.server";
import { emailVerificationState } from "~/lib/email-verification";
import { UserError } from "~/lib/errors";
import { logError } from "~/lib/log";
import { hasRecentEmailLinkLogin } from "~/lib/reauth";
import { safeNextPath } from "~/lib/redirect";

export const DELETE_ACCOUNT_CONFIRMATION = "LÖSCHEN";

type Fields = Record<string, unknown>;
const fields = (data: unknown): Fields => (data && typeof data === "object" ? (data as Fields) : {});

async function sendVerificationLink(userId: string, email: string) {
  const token = await createEmailToken(db(), userId, "verify_email");
  await sendEmail(verificationEmail(email, `${origins().platform}/auth/link?token=${encodeURIComponent(token)}&next=/dashboard`));
}

export const getViewer = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("Cache-Control", "private, no-store");
  const session = await currentSession();
  if (!session) return null;
  return {
    email: session.user.email,
    verification: emailVerificationState(session.user),
    fromRecentEmailLink: hasRecentEmailLinkLogin(session),
  };
});

export const signIn = createServerFn({ method: "POST" }).validator(fields).handler(async ({ data }) => {
  return attempt("auth.sign_in", async () => {
    await rateLimit("login", 8, 15 * 60);
    const email = normalizeEmail(data.email);
    const password = validatePassword(data.password);
    const user = await authenticate(db(), email, password);
    if (!user) throw new UserError("E-Mail-Adresse oder Passwort ist falsch.");
    const session = await createSession(db(), user.id, "password");
    setSessionCookie(session.token, session.expiresAt);
    return {};
  }, "Anmeldung fehlgeschlagen.");
});

export const signUp = createServerFn({ method: "POST" }).validator(fields).handler(async ({ data }) => {
  return attempt("auth.sign_up", async () => {
    await rateLimit("signup", 5, 60 * 60);
    const user = await createUser(db(), normalizeEmail(data.email), validatePassword(data.password));
    const session = await createSession(db(), user.id, "password");
    setSessionCookie(session.token, session.expiresAt);
    // The account is usable right away; a failed email can be re-sent from the banner.
    await sendVerificationLink(user.id, user.email).catch((error) => logError("auth.verification_email", error));
    return {};
  }, "Registrierung fehlgeschlagen.");
});

export const resendVerification = createServerFn({ method: "POST" }).handler(async () => {
  return attempt("auth.verification_resend", async () => {
    const session = await requireSession({ allowUnverified: true });
    await rateLimit("email-verification", 4, 60 * 60);
    await sendVerificationLink(session.user.id, session.user.email);
    return {};
  }, "Der Link konnte nicht gesendet werden. Bitte versuche es erneut.");
});

export const requestPasswordReset = createServerFn({ method: "POST" }).validator(fields).handler(async ({ data }) => {
  return attempt("auth.password_reset_request", async () => {
    await rateLimit("password-reset", 4, 60 * 60);
    const email = normalizeEmail(data.email);
    const user = await findUserByEmail(db(), email);
    if (user) {
      const token = await createEmailToken(db(), user.id, "reset_password");
      await sendEmail(passwordResetEmail(user.email, `${origins().platform}/auth/link?token=${encodeURIComponent(token)}&next=/passwort-neu`));
    }
    // Same answer either way, so the form does not reveal which addresses have an account.
    return { message: "Falls ein Konto existiert, haben wir einen Link gesendet." };
  }, "Anfrage fehlgeschlagen.");
});

/** Follows an emailed link: signs in on this device and marks the address as verified. */
export const consumeEmailLink = createServerFn({ method: "POST" }).validator(fields).handler(async ({ data }) => {
  return attempt("auth.email_link", async () => {
    await rateLimit("email-link", 20, 60 * 60);
    const consumed = await consumeEmailToken(db(), String(data.token ?? ""));
    if (!consumed) throw new UserError("Dieser Link ist ungültig oder abgelaufen.");
    await markEmailVerified(db(), consumed.userId);
    await deleteSession(db(), sessionToken());
    const session = await createSession(db(), consumed.userId, "email_link");
    setSessionCookie(session.token, session.expiresAt);
    return { next: safeNextPath(typeof data.next === "string" ? data.next : null, consumed.purpose === "reset_password" ? "/passwort-neu" : "/dashboard") };
  });
});

export const updatePassword = createServerFn({ method: "POST" }).validator(fields).handler(async ({ data }) => {
  return attempt("auth.password_update", async () => {
    const session = await requireSession({ allowUnverified: true });
    await rateLimit("password-update", 6, 60 * 60);
    const password = validatePassword(data.password);
    // Without a fresh emailed link, a stolen session alone must not be enough to take over the account.
    if (!hasRecentEmailLinkLogin(session) && !(await checkPassword(db(), session.user.id, String(data.currentPassword ?? "")))) {
      throw new UserError("Das aktuelle Passwort ist falsch.");
    }
    await changePassword(db(), session.user.id, password, await sha256Hex(sessionToken()));
    return {};
  }, "Passwort konnte nicht geändert werden.");
});

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  await deleteSession(db(), sessionToken());
  clearSessionCookie();
  return { ok: true as const };
});

export const deleteAccount = createServerFn({ method: "POST" }).validator(fields).handler(async ({ data }) => {
  return attempt("auth.delete_account", async () => {
    const session = await requireSession({ allowUnverified: true });
    await rateLimit("delete-account", 5, 60 * 60);
    if (String(data.confirm ?? "").trim() !== DELETE_ACCOUNT_CONFIRMATION) throw new UserError(`Bitte gib zur Bestätigung «${DELETE_ACCOUNT_CONFIRMATION}» ein.`);
    if (!(await checkPassword(db(), session.user.id, String(data.password ?? "")))) throw new UserError("Das Passwort ist falsch.");
    // Rows cascade with the user; stored files do not, so remove them first.
    const keys = await ownedAssetKeys(db(), session.user.id);
    for (let index = 0; index < keys.length; index += 1000) await images().delete(keys.slice(index, index + 1000));
    await deleteUser(db(), session.user.id);
    clearSessionCookie();
    return {};
  }, "Das Konto konnte nicht gelöscht werden.");
});
