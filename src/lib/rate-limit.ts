import "server-only";
import { createHash } from "crypto";
import { headers } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function enforceRateLimit(scope: string, limit: number, windowSeconds: number) {
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const identifier = createHash("sha256").update(`${scope}:${ip}`).digest("hex");
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_key: identifier,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error("Anfrage konnte nicht geprüft werden.");
  if (!data) throw new Error("Zu viele Versuche. Bitte später erneut versuchen.");
}
