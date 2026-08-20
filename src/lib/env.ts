import "server-only";

type PublicEnv = { url: string; publishableKey: string };

export function publicSupabaseEnv(): PublicEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Supabase ist nicht konfiguriert. Bitte .env.local gemäss .env.example ergänzen.");
  }
  return { url, publishableKey };
}

export function serviceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY fehlt.");
  return key;
}
