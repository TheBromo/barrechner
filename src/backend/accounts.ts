import { UserError } from "~/lib/errors";
import { emailVerificationRequiredBy } from "~/lib/email-verification";
import { DUMMY_PASSWORD_HASH, hashPassword, randomToken, sha256Hex, verifyPassword } from "./crypto";

export type User = {
  id: string;
  email: string;
  createdAt: number;
  emailVerifiedAt: number | null;
  verificationRequiredBy: number | null;
};

export type Session = { user: User; method: "password" | "email_link"; authenticatedAt: number; expiresAt: number };

export type EmailTokenPurpose = "verify_email" | "reset_password";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const EMAIL_TOKEN_TTL_MS: Record<EmailTokenPurpose, number> = {
  verify_email: 7 * 24 * 60 * 60 * 1000,
  reset_password: 60 * 60 * 1000,
};

type UserRow = { id: string; email: string; password_hash: string; created_at: number; email_verified_at: number | null; verification_required_by: number | null };

const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  createdAt: row.created_at,
  emailVerifiedAt: row.email_verified_at,
  verificationRequiredBy: row.verification_required_by,
});

export function normalizeEmail(value: unknown): string {
  const email = String(value ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new UserError("Bitte eine gültige E-Mail-Adresse eingeben.");
  return email;
}

export function validatePassword(value: unknown): string {
  const password = String(value ?? "");
  if (password.length < 8) throw new UserError("Das Passwort muss mindestens 8 Zeichen lang sein.");
  if (password.length > 512) throw new UserError("Das Passwort ist zu lang.");
  return password;
}

export async function createUser(db: D1Database, email: string, password: string, now = Date.now()): Promise<User> {
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const result = await db
    .prepare(
      `INSERT INTO users (id, email, password_hash, created_at, verification_required_by) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (email) DO NOTHING`,
    )
    .bind(id, email, passwordHash, now, emailVerificationRequiredBy(now))
    .run();
  if (!result.meta.changes) throw new UserError("Für diese E-Mail-Adresse besteht bereits ein Konto.");
  return { id, email, createdAt: now, emailVerifiedAt: null, verificationRequiredBy: emailVerificationRequiredBy(now) };
}

export async function findUserByEmail(db: D1Database, email: string): Promise<User | null> {
  const row = await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<UserRow>();
  return row ? toUser(row) : null;
}

/** Returns the user when the password matches; spends the same hashing time for unknown emails. */
export async function authenticate(db: D1Database, email: string, password: string): Promise<User | null> {
  const row = await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<UserRow>();
  const valid = await verifyPassword(password, row?.password_hash ?? DUMMY_PASSWORD_HASH);
  return row && valid ? toUser(row) : null;
}

export async function checkPassword(db: D1Database, userId: string, password: string): Promise<boolean> {
  const row = await db.prepare("SELECT password_hash FROM users WHERE id = ?").bind(userId).first<{ password_hash: string }>();
  return Boolean(row && password && (await verifyPassword(password, row.password_hash)));
}

/** Changes the password and signs out every other session of the user. */
export async function changePassword(db: D1Database, userId: string, password: string, keepSessionHash: string | null) {
  const row = await db.prepare("SELECT password_hash FROM users WHERE id = ?").bind(userId).first<{ password_hash: string }>();
  if (!row) throw new UserError("Das Konto wurde nicht gefunden.");
  if (await verifyPassword(password, row.password_hash)) throw new UserError("Das neue Passwort muss sich vom bisherigen unterscheiden.");
  await db.batch([
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(password), userId),
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND id_hash IS NOT ?").bind(userId, keepSessionHash),
  ]);
}

export async function markEmailVerified(db: D1Database, userId: string, now = Date.now()) {
  await db.prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?").bind(now, userId).run();
}

export async function deleteUser(db: D1Database, userId: string) {
  await db.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
}

// --- sessions -------------------------------------------------------------------------------

/** Creates a session and returns the raw token for the cookie; only its hash is stored. */
export async function createSession(db: D1Database, userId: string, method: Session["method"], now = Date.now()): Promise<{ token: string; expiresAt: number }> {
  const token = randomToken();
  const expiresAt = now + SESSION_TTL_MS;
  await db
    .prepare("INSERT INTO sessions (id_hash, user_id, method, authenticated_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(await sha256Hex(token), userId, method, now, expiresAt)
    .run();
  return { token, expiresAt };
}

export async function findSession(db: D1Database, token: string, now = Date.now()): Promise<Session | null> {
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT users.*, sessions.method, sessions.authenticated_at, sessions.expires_at FROM sessions
       JOIN users ON users.id = sessions.user_id WHERE sessions.id_hash = ? AND sessions.expires_at > ?`,
    )
    .bind(await sha256Hex(token), now)
    .first<UserRow & { method: Session["method"]; authenticated_at: number; expires_at: number }>();
  if (!row) return null;
  return { user: toUser(row), method: row.method, authenticatedAt: row.authenticated_at, expiresAt: row.expires_at };
}

export async function deleteSession(db: D1Database, token: string) {
  if (token) await db.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(await sha256Hex(token)).run();
}

// --- emailed single-use links -------------------------------------------------------------

export async function createEmailToken(db: D1Database, userId: string, purpose: EmailTokenPurpose, now = Date.now()): Promise<string> {
  const token = randomToken();
  await db
    .prepare("INSERT INTO email_tokens (token_hash, user_id, purpose, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(await sha256Hex(token), userId, purpose, now, now + EMAIL_TOKEN_TTL_MS[purpose])
    .run();
  return token;
}

/** Atomically marks an unused, unexpired token as used and returns its owner, or null. */
export async function consumeEmailToken(db: D1Database, token: string, now = Date.now()): Promise<{ userId: string; purpose: EmailTokenPurpose } | null> {
  if (!token || token.length > 200) return null;
  const row = await db
    .prepare(
      `UPDATE email_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
       RETURNING user_id, purpose`,
    )
    .bind(now, await sha256Hex(token), now)
    .first<{ user_id: string; purpose: EmailTokenPurpose }>();
  return row ? { userId: row.user_id, purpose: row.purpose } : null;
}
