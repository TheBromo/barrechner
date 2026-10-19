import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";

/**
 * Infrastructure for barrechner.ch:
 *  - D1 database (schema in ./migrations, applied on every deploy)
 *  - R2 bucket for uploaded logo and category images
 *  - the TanStack Start app as a Worker with a daily cleanup Cron Trigger
 *  - on the production stage: zone routes and DNS for {root} and *.{root}
 */

const PRODUCTION_STAGE = "prod";

export default Alchemy.Stack(
  "barrechner",
  {
    providers: Cloudflare.providers(),
    // `alchemy dev` runs fully locally (D1, R2 and the Worker are emulated) and needs no Cloudflare account.
    state: process.env.ALCHEMY_DEV === "true" ? Alchemy.localState() : Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const dev = yield* Alchemy.ALCHEMY_DEV;
    const production = stage === PRODUCTION_STAGE && !dev;

    const rootDomain = yield* Config.String("ROOT_DOMAIN").pipe(Config.withDefault("barrechner.ch"));
    const optionalSecret = (name: string) =>
      Config.option(Config.Redacted(name)).pipe(
        Effect.map((value) => (Option.isSome(value) ? { [name]: value.value } : {})),
      );
    const secrets = Object.assign(
      {},
      yield* optionalSecret("MISTRAL_API_KEY"),
      yield* optionalSecret("RESEND_API_KEY"),
    ) as Record<string, Redacted.Redacted<string>>;
    const emailFrom = yield* Config.String("EMAIL_FROM").pipe(Config.withDefault(`Barrechner <noreply@${rootDomain}>`));

    const db = yield* Cloudflare.D1.Database("Database", { migrations: "./migrations" });
    const images = yield* Cloudflare.R2.Bucket("Images");

    const website = yield* Cloudflare.Website.Vite("Website", {
      env: {
        DB: db,
        IMAGES: images,
        // Only the production stage serves the real domain; previews and dev use their own URL as platform.
        ROOT_DOMAIN: production ? rootDomain : "",
        EMAIL_FROM: emailFrom,
        ...secrets,
      },
      crons: ["17 3 * * *"],
      ...(production
        ? {
            routes: [
              { pattern: `${rootDomain}/*`, zoneName: rootDomain },
              { pattern: `*.${rootDomain}/*`, zoneName: rootDomain },
            ],
          }
        : {}),
    });

    if (production) {
      const zone = yield* Cloudflare.Zone.Zone("Zone", { name: rootDomain }).pipe(Alchemy.AdoptPolicy.adopt(true));
      // Routes only fire for proxied hostnames; the Worker is the only origin, so point them at the 100:: placeholder.
      for (const [id, name] of [["ApexRecord", rootDomain], ["WwwRecord", `www.${rootDomain}`], ["WildcardRecord", `*.${rootDomain}`]] as const) {
        yield* Cloudflare.DNS.Record(id, { zoneId: zone.zoneId, name, type: "AAAA", content: "100::", proxied: true }).pipe(
          Alchemy.AdoptPolicy.adopt(true),
        );
      }
    }

    return { url: website.url.as<string>(), stage, rootDomain: production ? rootDomain : "(workers.dev)" };
  }),
);
