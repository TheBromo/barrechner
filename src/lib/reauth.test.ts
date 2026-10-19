import { describe, expect, it } from "vitest";
import { hasRecentEmailLinkLogin } from "./reauth";

const now = Date.UTC(2026, 9, 19, 12);
const secondsAgo = (seconds: number) => now / 1000 - seconds;

describe("re-authentication via emailed link", () => {
  it("accepts a fresh recovery or magic-link login", () => {
    expect(hasRecentEmailLinkLogin([{ method: "recovery", timestamp: secondsAgo(60) }], now)).toBe(true);
    expect(hasRecentEmailLinkLogin([{ method: "password", timestamp: secondsAgo(9999) }, { method: "otp", timestamp: secondsAgo(30) }], now)).toBe(true);
  });

  it("rejects password logins, stale links and malformed claims", () => {
    expect(hasRecentEmailLinkLogin([{ method: "password", timestamp: secondsAgo(10) }], now)).toBe(false);
    expect(hasRecentEmailLinkLogin([{ method: "recovery", timestamp: secondsAgo(16 * 60) }], now)).toBe(false);
    expect(hasRecentEmailLinkLogin(["recovery"], now)).toBe(false);
    expect(hasRecentEmailLinkLogin(undefined, now)).toBe(false);
  });
});
