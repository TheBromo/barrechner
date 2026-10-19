import { beforeEach, describe, expect, it } from "vitest";
import { createTestD1 } from "../d1";
import {
  authenticate, changePassword, checkPassword, consumeEmailToken, createEmailToken, createSession, createUser,
  deleteSession, deleteUser, findSession, markEmailVerified, normalizeEmail, validatePassword, EMAIL_TOKEN_TTL_MS, SESSION_TTL_MS,
} from "~/backend/accounts";
import { hashPassword, verifyPassword } from "~/backend/crypto";
import { consumeRateLimit } from "~/backend/rate-limit";

let db: D1Database;
beforeEach(() => { db = createTestD1(); });

describe("passwords", () => {
  it("hashes with a random salt and verifies", async () => {
    const first = await hashPassword("geheim123");
    expect(first).toMatch(/^pbkdf2-sha256\$100000\$/);
    expect(first).not.toBe(await hashPassword("geheim123"));
    expect(await verifyPassword("geheim123", first)).toBe(true);
    expect(await verifyPassword("geheim124", first)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
  it("validates input", () => {
    expect(normalizeEmail(" Du@Beispiel.CH ")).toBe("du@beispiel.ch");
    expect(() => normalizeEmail("kein-mail")).toThrow("gültige E-Mail");
    expect(() => validatePassword("kurz")).toThrow("mindestens 8");
  });
});

describe("accounts", () => {
  it("creates users with a 30-day verification deadline and rejects duplicates case-insensitively", async () => {
    const user = await createUser(db, "anna@example.ch", "passwort1", 1000);
    expect(user.verificationRequiredBy).toBe(1000 + 30 * 24 * 60 * 60 * 1000);
    await expect(createUser(db, "ANNA@example.ch", "passwort2")).rejects.toThrow("besteht bereits ein Konto");
  });
  it("authenticates only with the right password", async () => {
    await createUser(db, "anna@example.ch", "passwort1");
    expect((await authenticate(db, "anna@example.ch", "passwort1"))?.email).toBe("anna@example.ch");
    expect(await authenticate(db, "anna@example.ch", "falsch123")).toBeNull();
    expect(await authenticate(db, "niemand@example.ch", "passwort1")).toBeNull();
  });
  it("stores only session hashes and expires sessions", async () => {
    const user = await createUser(db, "anna@example.ch", "passwort1");
    const { token } = await createSession(db, user.id, "password", 0);
    const stored = await db.prepare("SELECT id_hash FROM sessions").first<string>("id_hash");
    expect(stored).not.toBe(token);
    expect((await findSession(db, token, 10))?.user.id).toBe(user.id);
    expect(await findSession(db, token, SESSION_TTL_MS + 1)).toBeNull();
    await deleteSession(db, token);
    expect(await findSession(db, token, 10)).toBeNull();
  });
  it("changing the password keeps the current session and ends all others", async () => {
    const user = await createUser(db, "anna@example.ch", "passwort1");
    const current = await createSession(db, user.id, "password");
    const other = await createSession(db, user.id, "password");
    const { sha256Hex } = await import("~/backend/crypto");
    await expect(changePassword(db, user.id, "passwort1", null)).rejects.toThrow("unterscheiden");
    await changePassword(db, user.id, "neuesPasswort", await sha256Hex(current.token));
    expect(await findSession(db, current.token)).not.toBeNull();
    expect(await findSession(db, other.token)).toBeNull();
    expect(await checkPassword(db, user.id, "neuesPasswort")).toBe(true);
  });
  it("email tokens are single-use and expire", async () => {
    const user = await createUser(db, "anna@example.ch", "passwort1");
    const token = await createEmailToken(db, user.id, "reset_password", 0);
    expect(await consumeEmailToken(db, token, EMAIL_TOKEN_TTL_MS.reset_password + 1)).toBeNull();
    const fresh = await createEmailToken(db, user.id, "verify_email");
    expect(await consumeEmailToken(db, fresh)).toEqual({ userId: user.id, purpose: "verify_email" });
    expect(await consumeEmailToken(db, fresh)).toBeNull();
    expect(await consumeEmailToken(db, "unknown")).toBeNull();
  });
  it("marks email verified once and deletes users with everything they own", async () => {
    const user = await createUser(db, "anna@example.ch", "passwort1");
    await markEmailVerified(db, user.id, 5);
    await markEmailVerified(db, user.id, 9);
    const { token } = await createSession(db, user.id, "email_link");
    expect((await findSession(db, token))?.user.emailVerifiedAt).toBe(5);
    await deleteUser(db, user.id);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM sessions").first("n")).toBe(0);
  });
});

describe("rate limits", () => {
  it("allows up to the limit per window and resets afterwards", async () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) expect(await consumeRateLimit(db, "k", 3, 1000, 100)).toBe(true);
    expect(await consumeRateLimit(db, "k", 3, 1000, 500)).toBe(false);
    expect(await consumeRateLimit(db, "k", 3, 1000, 1100)).toBe(true);
    expect(await consumeRateLimit(db, "other", 3, 1000, 500)).toBe(true);
  });
});
