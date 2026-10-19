export const GENERIC_ERROR = "Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.";

const MIGRATION_MISSING = "Der Barkarten-Import ist in Supabase noch nicht eingerichtet. Bitte führe die aktuelle Migration aus.";

/**
 * Turn an error into text that is safe to show to a user.
 *
 * Plain `Error`s thrown by our own code and `raise exception` messages from our database
 * functions (SQLSTATE P0001) are written for users. Everything else — Supabase, PostgREST,
 * Storage and Auth errors, or programming errors — may leak internals and gets a generic text.
 */
export function userMessage(error: unknown, fallback = GENERIC_ERROR): string {
  if (!error || typeof error !== "object") return fallback;
  const record = error as { message?: unknown; code?: unknown; __isAuthError?: unknown; __isStorageError?: unknown };
  const message = typeof record.message === "string" ? record.message.trim() : "";
  const code = typeof record.code === "string" ? record.code : "";

  if (
    ((code === "42P01" || code === "PGRST205" || /schema cache/i.test(message)) && message.includes("bar_import_uploads")) ||
    /bucket.*not found|not found.*bucket/i.test(message)
  ) return MIGRATION_MISSING;
  if (code === "23505" || message.includes("bars_slug_key")) return "Diese Adresse ist bereits vergeben.";
  if (record.__isAuthError || record.__isStorageError) return fallback;
  if (code) return code === "P0001" && message ? message : fallback;
  if (error instanceof Error && error.constructor === Error && message) return message;
  return fallback;
}
