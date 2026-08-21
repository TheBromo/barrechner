import "server-only";
import { resolveServerSupabaseConfig } from "@/lib/supabase/config";

type PublicEnv = { url: string; publishableKey: string };

export function publicSupabaseEnv(): PublicEnv {
  const config = resolveServerSupabaseConfig(process.env);
  if (!config) {
    throw new Error("Supabase ist nicht konfiguriert. Bitte .env.local gemäss .env.example ergänzen.");
  }
  return config;
}

export function serverAdminKey(): string {
  const key =
    process.env.supabase_SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.supabase_SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Supabase Secret Key oder Service-Role-Key fehlt.");
  return key;
}
