import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { EMAIL_VERIFIED_AT_KEY } from "@/lib/email-verification";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const requestedNext = request.nextUrl.searchParams.get("next");
  const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/dashboard";
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      if (request.nextUrl.searchParams.get("verify_email") === "1") {
        const admin = createSupabaseAdminClient();
        const { error: metadataError } = await admin.auth.admin.updateUserById(data.user.id, {
          app_metadata: {
            ...data.user.app_metadata,
            [EMAIL_VERIFIED_AT_KEY]: new Date().toISOString(),
          },
        });
        if (metadataError) return NextResponse.redirect(new URL("/email-bestaetigen?status=fehler", request.url));
        await supabase.auth.refreshSession();
      }
      return NextResponse.redirect(new URL(next, request.url));
    }
  }
  return NextResponse.redirect(new URL("/anmelden?fehler=link", request.url));
}
