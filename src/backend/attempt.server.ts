import { isNotFound, isRedirect } from "@tanstack/react-router";
import { userMessage } from "~/lib/errors";
import { logError } from "~/lib/log";
import type { Result } from "~/lib/result";

/** Run a mutation and turn failures into a user-safe message; redirects pass through. */
export async function attempt<T extends object>(event: string, action: () => Promise<T>, fallback?: string): Promise<Result<T>> {
  try {
    return { ok: true, ...(await action()) };
  } catch (error) {
    if (isRedirect(error) || isNotFound(error)) throw error;
    logError(event, error);
    return { ok: false, error: userMessage(error, fallback) };
  }
}
