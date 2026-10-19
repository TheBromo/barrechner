/** How long after following an emailed link a password may be changed without the current one. */
export const EMAIL_LINK_REAUTH_MS = 15 * 60 * 1000;

export function hasRecentEmailLinkLogin(session: { method: string; authenticatedAt: number }, nowMs = Date.now()): boolean {
  return session.method === "email_link" && nowMs - session.authenticatedAt <= EMAIL_LINK_REAUTH_MS;
}
