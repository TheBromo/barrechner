export const EMAIL_VERIFICATION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

export type VerificationFields = { emailVerifiedAt: number | null; verificationRequiredBy: number | null };

export type EmailVerificationState =
  | { status: "verified" }
  | { status: "grace"; requiredBy: number }
  | { status: "required"; requiredBy: number };

export function emailVerificationRequiredBy(createdAt: number): number {
  return createdAt + EMAIL_VERIFICATION_GRACE_MS;
}

export function emailVerificationState(user: VerificationFields, now = Date.now()): EmailVerificationState {
  if (user.emailVerifiedAt != null) return { status: "verified" };
  // Accounts without a deadline (e.g. migrated ones) are deliberately grandfathered in.
  if (user.verificationRequiredBy == null) return { status: "verified" };
  if (!Number.isFinite(user.verificationRequiredBy)) return { status: "required", requiredBy: 0 };
  return now < user.verificationRequiredBy
    ? { status: "grace", requiredBy: user.verificationRequiredBy }
    : { status: "required", requiredBy: user.verificationRequiredBy };
}

export function formatSwissDate(ms: number): string {
  const date = new Date(ms);
  return `${date.getUTCDate()}.${date.getUTCMonth() + 1}.${date.getUTCFullYear()}`;
}
