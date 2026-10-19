import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

/**
 * One-off stack, deployed from a laptop with an admin profile:
 *   npx alchemy deploy --config stacks/github.ts --profile admin
 * It mints a Cloudflare API token scoped to what alchemy.run.ts needs and stores it,
 * with the account ID, as GitHub Actions secrets. Re-run it to rotate the token.
 */
const OWNER = "TheBromo";
const REPOSITORY = "barrechner";

export default Alchemy.Stack(
  "barrechner-github",
  { providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()), state: Cloudflare.state() },
  Effect.gen(function* () {
    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment;

    const token = yield* Cloudflare.ApiToken.AccountApiToken("CIToken", {
      accountId,
      policies: [
        {
          effect: "allow",
          permissionGroups: [
            "Workers Scripts Write",
            "Workers R2 Storage Write",
            "D1 Write",
            "Secrets Store Write",
            "Account Settings Read",
            "Workers Tail Read",
          ],
          resources: { [`com.cloudflare.api.account.${accountId}`]: "*" },
        },
        {
          // Production routes and DNS records on the barrechner.ch zone.
          effect: "allow",
          permissionGroups: ["Zone Read", "DNS Write", "Workers Routes Write"],
          resources: { [`com.cloudflare.api.account.${accountId}`]: { "com.cloudflare.api.account.zone.*": "*" } },
        },
      ],
    });

    yield* GitHub.Secret("CloudflareApiToken", { owner: OWNER, repository: REPOSITORY, name: "CLOUDFLARE_API_TOKEN", value: token.value });
    yield* GitHub.Secret("CloudflareAccountId", { owner: OWNER, repository: REPOSITORY, name: "CLOUDFLARE_ACCOUNT_ID", value: Redacted.make(accountId) });
  }),
);
