/** How long after following an emailed link a password may be changed without the current one. */
export const EMAIL_LINK_REAUTH_SECONDS = 15 * 60;

const EMAIL_LINK_METHODS = new Set(["recovery", "otp", "magiclink", "email/signup"]);

/** True when the session was established through an emailed link within the re-auth window. */
export function hasRecentEmailLinkLogin(amr: unknown, nowMs = Date.now()): boolean {
  if (!Array.isArray(amr)) return false;
  return amr.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    return typeof method === "string" &&
      EMAIL_LINK_METHODS.has(method) &&
      typeof timestamp === "number" &&
      nowMs / 1000 - timestamp <= EMAIL_LINK_REAUTH_SECONDS;
  });
}
