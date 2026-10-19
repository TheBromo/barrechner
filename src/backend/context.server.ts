import { redirect } from "@tanstack/react-router";
import { deleteCookie, getCookie, getRequest, getRequestHeader, setCookie, setResponseHeader } from "@tanstack/react-start/server";
import { emailVerificationState } from "~/lib/email-verification";
import { originsFor, type Origins } from "~/lib/urls";
import { findSession, type Session } from "./accounts";
import { env } from "./env.server";
import { enforceRateLimit } from "./rate-limit";

export const db = () => env.DB;
export const images = () => env.IMAGES;

export function requestUrl(): URL {
  return new URL(getRequest().url);
}

export function origins(): Origins {
  return originsFor(getRequest().url, env.ROOT_DOMAIN ?? "");
}

export function clientIp(): string {
  return getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function rateLimit(scope: string, limit: number, windowSeconds: number) {
  if (env.DISABLE_RATE_LIMITS === "true") return;
  await enforceRateLimit(db(), scope, clientIp(), limit, windowSeconds);
}

/** `__Host-` cookies must be Secure; plain-HTTP local development uses an unprefixed name. */
function sessionCookieName() {
  return requestUrl().protocol === "https:" ? "__Host-barrechner_session" : "barrechner_session";
}

export function sessionToken(): string {
  return getCookie(sessionCookieName()) ?? "";
}

export function setSessionCookie(token: string, expiresAt: number) {
  setCookie(sessionCookieName(), token, {
    httpOnly: true,
    secure: requestUrl().protocol === "https:",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie() {
  deleteCookie(sessionCookieName(), { path: "/" });
}

const sessions = new WeakMap<Request, Promise<Session | null>>();

/** The signed-in session of this request, looked up once per request. */
export function currentSession(): Promise<Session | null> {
  const request = getRequest();
  let session = sessions.get(request);
  if (!session) {
    session = findSession(db(), sessionToken());
    sessions.set(request, session);
  }
  return session;
}

/** Every private server function calls this; route guards only improve navigation. */
export async function requireSession(options: { allowUnverified?: boolean } = {}): Promise<Session> {
  setResponseHeader("Cache-Control", "private, no-store");
  const session = await currentSession();
  if (!session) throw redirect({ to: "/anmelden" });
  if (!options.allowUnverified && emailVerificationState(session.user).status === "required") throw redirect({ to: "/email-bestaetigen" });
  return session;
}
