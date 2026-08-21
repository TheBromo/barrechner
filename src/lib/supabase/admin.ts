import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicSupabaseEnv, serverAdminKey } from "@/lib/env";

export function createSupabaseAdminClient() {
  const { url } = publicSupabaseEnv();
  return createClient(url, serverAdminKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
