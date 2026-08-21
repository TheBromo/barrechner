import { describe, expect, it } from "vitest";
import {
  EMAIL_VERIFICATION_REQUIRED_BY_KEY,
  EMAIL_VERIFIED_AT_KEY,
  emailVerificationRequiredBy,
  emailVerificationState,
} from "./email-verification";

const createdAt = "2026-08-01T12:00:00.000Z";

describe("email verification grace period", () => {
  it("ends exactly 30 days after signup", () => {
    expect(emailVerificationRequiredBy(createdAt).toISOString()).toBe("2026-08-31T12:00:00.000Z");
  });

  it("allows an unverified new account before its deadline", () => {
    const state = emailVerificationState(
      {
        created_at: createdAt,
        app_metadata: { [EMAIL_VERIFICATION_REQUIRED_BY_KEY]: "2026-08-31T12:00:00.000Z" },
      },
      new Date("2026-08-31T11:59:59.999Z"),
    );
    expect(state.status).toBe("grace");
  });

  it("requires verification at the deadline", () => {
    const state = emailVerificationState(
      {
        created_at: createdAt,
        app_metadata: { [EMAIL_VERIFICATION_REQUIRED_BY_KEY]: "2026-08-31T12:00:00.000Z" },
      },
      new Date("2026-08-31T12:00:00.000Z"),
    );
    expect(state.status).toBe("required");
  });

  it("allows a verified or pre-existing account", () => {
    expect(emailVerificationState({ created_at: createdAt, app_metadata: {} }).status).toBe("verified");
    expect(emailVerificationState({
      created_at: createdAt,
      app_metadata: {
        [EMAIL_VERIFICATION_REQUIRED_BY_KEY]: "2026-08-02T12:00:00.000Z",
        [EMAIL_VERIFIED_AT_KEY]: "2026-08-01T12:05:00.000Z",
      },
    }).status).toBe("verified");
  });
});
