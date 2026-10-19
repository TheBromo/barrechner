import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType, User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { EMAIL_VERIFIED_AT_KEY } from "@/lib/email-verification";
import { logError } from "@/lib/log";
import { safeNextPath } from "@/lib/redirect";

const EMAIL_LINK_TYPES = new Set<EmailOtpType>(["recovery", "email", "magiclink", "signup"]);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNextPath(params.get("next"));
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  const supabase = await createSupabaseServerClient();
  let user: User | null = null;
  if (tokenHash && type && EMAIL_LINK_TYPES.has(type)) {
    // Token-hash links work on any device; PKCE codes only in the browser that requested them.
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) logError("auth.callback.verify_otp", error);
    user = error ? null : data.user;
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) logError("auth.callback.exchange", error);
    user = error ? null : data.user;
  }
  if (!user) return NextResponse.redirect(new URL("/anmelden?fehler=link", request.url));

  if (params.get("verify_email") === "1") {
    const admin = createSupabaseAdminClient();
    const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...user.app_metadata,
        [EMAIL_VERIFIED_AT_KEY]: new Date().toISOString(),
      },
    });
    if (metadataError) {
      logError("auth.callback.mark_verified", metadataError);
      return NextResponse.redirect(new URL("/email-bestaetigen?status=fehler", request.url));
    }
    await supabase.auth.refreshSession();
  }
  return NextResponse.redirect(new URL(next, request.url));
}
