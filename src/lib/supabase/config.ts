type SupabaseEnvironment = Record<string, string | undefined>;

export type SupabasePublicConfig = { url: string; publishableKey: string };

function firstValue(...values: Array<string | undefined>): string | undefined {
  return values.map((value) => value?.trim()).find(Boolean);
}

function projectUrlFromPostgresHost(hostValue: string | undefined): string | undefined {
  const value = hostValue?.trim();
  if (!value) return undefined;

  try {
    const hostname = new URL(value.includes("://") ? value : `postgres://${value}`).hostname;
    const match = hostname.match(/^db\.([a-z0-9-]+)\.supabase\.co$/i);
    return match ? `https://${match[1].toLowerCase()}.supabase.co` : undefined;
  } catch {
    return undefined;
  }
}

export function resolveServerSupabaseConfig(env: SupabaseEnvironment): SupabasePublicConfig | null {
  const url = firstValue(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_supabase_SUPABASE_URL,
    env.SUPABASE_URL,
    env.supabase_SUPABASE_URL,
    projectUrlFromPostgresHost(env.supabase_POSTGRES_HOST),
  );
  const publishableKey = firstValue(
    env.NEXT_PUBLIC_supabase_SUPABASE_PUBLISHABLE_KEY,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    env.NEXT_PUBLIC_supabase_SUPABASE_ANON_KEY,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    env.supabase_SUPABASE_PUBLISHABLE_KEY,
    env.supabase_SUPABASE_ANON_KEY,
    env.SUPABASE_ANON_KEY,
  );

  return url && publishableKey ? { url, publishableKey } : null;
}
