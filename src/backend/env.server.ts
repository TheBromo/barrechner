import * as cf from "cloudflare:workers";

/** Worker bindings declared in alchemy.run.ts. */
export type AppEnv = {
  DB: D1Database;
  IMAGES: R2Bucket;
  /** "barrechner.ch" on production; empty on previews and in development. */
  ROOT_DOMAIN: string;
  EMAIL_FROM: string;
  MISTRAL_API_KEY?: string;
  RESEND_API_KEY?: string;
  /** Set only by `alchemy dev` for end-to-end tests. */
  DISABLE_RATE_LIMITS?: string;
};

// TanStack Start evaluates modules outside the request context in development, so resolve
// bindings lazily on property access instead of reading `cf.env` at import time.
export const env = new Proxy({} as AppEnv, {
  get(_, property) {
    return (cf.env as unknown as Record<string | symbol, unknown>)[property];
  },
});
