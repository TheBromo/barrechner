import "server-only";

type PublicEnv = { url: string; publishableKey: string };

export function publicSupabaseEnv(): PublicEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_supabase_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_supabase_SUPABASE_ANON_KEY;
  if (!url || !publishableKey) {
    throw new Error("Supabase ist nicht konfiguriert. Bitte .env.local gemäss .env.example ergänzen.");
  }
  return { url, publishableKey };
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
