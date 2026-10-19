export const GENERIC_ERROR = "Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.";

/** An error whose message was written for users and may be shown as is. */
export class UserError extends Error {
  override name = "UserError";
}

/**
 * Turn an error into text that is safe to show to a user. Only `UserError`s are shown verbatim;
 * database, storage, network and programming errors may leak internals and get a generic text.
 */
export function userMessage(error: unknown, fallback = GENERIC_ERROR): string {
  if (!error || typeof error !== "object") return fallback;
  const message = typeof (error as { message?: unknown }).message === "string" ? (error as { message: string }).message.trim() : "";
  if (/UNIQUE constraint failed: bars\.slug/i.test(message)) return "Diese Adresse ist bereits vergeben.";
  if (error instanceof UserError && message) return message;
  return fallback;
}
