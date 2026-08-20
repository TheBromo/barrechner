import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { validateSlug } from "@/lib/slug";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  try {
    await enforceRateLimit("slug-check", 80, 60 * 60);
    const slug = validateSlug(request.nextUrl.searchParams.get("slug") ?? "");
    const supabase = createSupabaseAdminClient();
    const [{ data: bar }, { data: redirect }] = await Promise.all([
      supabase.from("bars").select("id").eq("slug", slug).maybeSingle(),
      supabase.from("slug_redirects").select("old_slug").eq("old_slug", slug).gt("expires_at", new Date().toISOString()).maybeSingle(),
    ]);
    return NextResponse.json({ slug, available: !bar && !redirect }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ available: false, error: error instanceof Error ? error.message : "Ungültige Adresse" }, { status: 400 });
  }
}
