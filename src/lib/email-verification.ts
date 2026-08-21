import type { User } from "@supabase/supabase-js";

export const EMAIL_VERIFICATION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
export const EMAIL_VERIFIED_AT_KEY = "barrechner_email_verified_at";
export const EMAIL_VERIFICATION_REQUIRED_BY_KEY = "barrechner_email_verification_required_by";

type VerificationUser = Pick<User, "app_metadata" | "created_at">;

export type EmailVerificationState =
  | { status: "verified" }
  | { status: "grace"; requiredBy: Date }
  | { status: "required"; requiredBy: Date };

export function emailVerificationRequiredBy(createdAt: string): Date {
  return new Date(new Date(createdAt).getTime() + EMAIL_VERIFICATION_GRACE_MS);
}

export function emailVerificationState(
  user: VerificationUser,
  now = new Date(),
): EmailVerificationState {
  if (typeof user.app_metadata[EMAIL_VERIFIED_AT_KEY] === "string") {
    return { status: "verified" };
  }

  const storedDeadline = user.app_metadata[EMAIL_VERIFICATION_REQUIRED_BY_KEY];
  // Accounts created before this feature are deliberately grandfathered in.
  if (typeof storedDeadline !== "string") return { status: "verified" };

  const requiredBy = new Date(storedDeadline);
  if (Number.isNaN(requiredBy.getTime())) return { status: "required", requiredBy: new Date(0) };
  return now.getTime() < requiredBy.getTime()
    ? { status: "grace", requiredBy }
    : { status: "required", requiredBy };
}
