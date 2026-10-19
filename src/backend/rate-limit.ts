import { UserError } from "~/lib/errors";
import { sha256Hex } from "./crypto";

/**
 * Fixed-window rate limit keyed by a hash of scope and client IP. A single UPSERT keeps the
 * check-and-increment atomic: it starts a new window when the old one expired, otherwise counts up.
 */
export async function consumeRateLimit(db: D1Database, key: string, limit: number, windowMs: number, now = Date.now()): Promise<boolean> {
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, attempts, window_started_at) VALUES (?1, 1, ?2)
       ON CONFLICT (key) DO UPDATE SET
         attempts = CASE WHEN window_started_at <= ?2 - ?3 THEN 1 ELSE attempts + 1 END,
         window_started_at = CASE WHEN window_started_at <= ?2 - ?3 THEN ?2 ELSE window_started_at END
       RETURNING attempts`,
    )
    .bind(key, now, windowMs)
    .first<{ attempts: number }>();
  return (row?.attempts ?? 1) <= limit;
}

export async function enforceRateLimit(db: D1Database, scope: string, clientIp: string, limit: number, windowSeconds: number) {
  const key = await sha256Hex(`${scope}:${clientIp}`);
  if (!(await consumeRateLimit(db, key, limit, windowSeconds * 1000))) {
    throw new UserError("Zu viele Versuche. Bitte später erneut versuchen.");
  }
}
