# Barrechner.ch

Multi-tenant price calculator for club festivals and small bars. Owners manage up to five bars on
`barrechner.ch`; each bar team uses its public, offline-capable calculator on `{slug}.barrechner.ch`.

The full product specification is in [SPEC.md](SPEC.md).

## Stack

| Concern | Technology |
| --- | --- |
| UI & routing | [TanStack Start](https://tanstack.com/start) (React 19, TanStack Router, server functions), Tailwind CSS 4 |
| Runtime | One Cloudflare Worker (SSR, server functions, image serving, daily Cron Trigger) |
| Data | Cloudflare D1 (SQLite) — schema in [`migrations/`](migrations), applied on every deploy |
| Images | Cloudflare R2, served by the Worker under `/img/…` |
| Auth | Built in: PBKDF2 password hashes, opaque session cookies, single-use emailed links |
| Email | [Resend](https://resend.com) HTTP API (logged to the console when not configured) |
| Menu import | Mistral OCR + `mistral-small` with a strict JSON schema |
| Infrastructure | [Alchemy](https://alchemy.run) v2 — everything is declared in [`alchemy.run.ts`](alchemy.run.ts) |

```
alchemy.run.ts        Infrastructure: D1, R2, Worker, cron, prod routes + DNS
stacks/github.ts      One-off stack that mints the CI API token and stores GitHub secrets
migrations/           D1 schema
src/server.ts         Worker entry: host routing, security headers, scheduled cleanup
src/routes/           Pages and HTTP routes (file-based)
src/functions/        Server functions called by pages (auth, bars, public)
src/backend/          Server-only logic: repositories, services, auth, email, Mistral
src/lib/              Shared, framework-free domain logic (validation, prices, theme, …)
src/components/       Calculator, editor, importer, forms
test/                 Vitest: domain, data layer (real SQL on node:sqlite), components
e2e/                  Playwright flows against `alchemy dev`
```

## Local development

Requires **Node.js 24.11+** (Alchemy v2 refuses older versions). No Cloudflare account is needed:
`alchemy dev` runs the Worker in workerd and emulates D1 and R2 locally.

```bash
npm ci
npm run dev        # http://localhost:1337
```

- Platform: <http://localhost:1337>
- A bar's calculator: `http://{slug}.localhost:1337` (browsers resolve `*.localhost` automatically)
- Without `RESEND_API_KEY`, outgoing emails (verification and password-reset links) are printed to the
  Worker log in `.alchemy/log/local/Website/`.
- Optional: put `MISTRAL_API_KEY=…` in `.env` to try the menu import locally.

## Tests

```bash
npm run check                 # tsc + vitest (97 tests) + vite build
npm run dev:e2e               # terminal 1: alchemy dev with rate limits disabled
npm run test:e2e              # terminal 2: Playwright end-to-end flows
```

`dev:e2e` sets `DISABLE_RATE_LIMITS=true`, which `alchemy.run.ts` only honours under `alchemy dev`.

## CI/CD

| Workflow | Trigger | What it does |
| --- | --- | --- |
| [`ci.yml`](.github/workflows/ci.yml) | pull requests (and called by `deploy.yml`) | typecheck, unit tests, build; Playwright E2E against a local `alchemy dev` stack |
| [`deploy.yml`](.github/workflows/deploy.yml) | push to `main` | runs CI, then `alchemy deploy --stage prod` (D1 migrations, Worker, routes, DNS) |
| | PR opened/updated | deploys an isolated preview stage `pr-{n}` on `*.workers.dev` (URL in the job summary) |
| | PR closed | `alchemy destroy --stage pr-{n}` |

Preview stages have no wildcard subdomains; open a bar's calculator there with `/?bar={slug}`.
Only the `prod` stage attaches `barrechner.ch` and `*.barrechner.ch`.

## One-time setup (what still has to be done by hand)

### 1. Cloudflare account and plan

1. Create (or pick) a Cloudflare account.
2. Subscribe to **Workers Paid** ($5/month). The free plan's 10 ms CPU limit per request is too low for
   PBKDF2 password hashing and for base64-encoding a 10 MB menu upload for Mistral.
3. Enable **R2** in the dashboard once (R2 → *Purchase/Enable*; the free tier is enough).

### 2. Move the domain to Cloudflare

1. *Websites → Add a site → `barrechner.ch`*, choose the Free plan.
2. At the registrar, replace the current (Vercel) nameservers with the two Cloudflare nameservers shown.
   Wait until the zone is **Active**.
3. In *DNS → Records*, delete any imported records for `barrechner.ch`, `www` and `*` that point at
   Vercel (A/CNAME). The production deploy creates proxied `AAAA 100::` records for all three and the
   Worker routes `barrechner.ch/*` and `*.barrechner.ch/*`. Keep MX/TXT records you still need.
4. *SSL/TLS → Overview*: set the mode to **Full (strict)**. Universal SSL covers the apex and
   `*.barrechner.ch` (first-level wildcard), which is all the app uses.
5. Optional but recommended: *SSL/TLS → Edge Certificates → Always Use HTTPS* on.

If you use a different domain, set the GitHub variable `ROOT_DOMAIN` (step 5) and repeat this for it.

### 3. Email (Resend)

1. Create a Resend account, add the domain `barrechner.ch` and add the SPF/DKIM records it shows
   to the Cloudflare DNS (not proxied). Wait until Resend reports the domain as verified.
2. Create an API key with *Sending access* → GitHub secret `RESEND_API_KEY`.
3. The sender defaults to `Barrechner <noreply@barrechner.ch>`; override with the GitHub variable `EMAIL_FROM`.

### 4. Mistral (menu import)

Create an API key at <https://console.mistral.ai> → GitHub secret `MISTRAL_API_KEY`.
Without it the editor shows the import as "not set up"; everything else works.

### 5. Credentials for GitHub Actions

Alchemy keeps its deployment state in a small state-store Worker in your Cloudflare account
(`Cloudflare.state()`). It must be bootstrapped once, interactively, before CI can deploy:

```bash
npm ci
npx alchemy profile create default      # log in to Cloudflare (OAuth or API token)
npx alchemy provider cloudflare bootstrap
```

Then give CI a scoped API token — either automatically:

```bash
npx alchemy profile create admin        # choose "API Token or API Key" (Global API Key works)
npx alchemy deploy --config stacks/github.ts --profile admin
```

which mints the token and writes the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets into
`TheBromo/barrechner` (it also asks for a GitHub credential) — or by hand: create an account API token
with **Workers Scripts Write, Workers R2 Storage Write, D1 Write, Secrets Store Write, Account Settings
Read, Workers Tail Read** on the account and **Zone Read, DNS Write, Workers Routes Write** on the
zone, and add both secrets under *Settings → Secrets and variables → Actions*.

Secrets and variables used by `deploy.yml`:

| Name | Kind | Required |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | secret | yes |
| `CLOUDFLARE_ACCOUNT_ID` | secret | yes |
| `RESEND_API_KEY` | secret | for real emails (otherwise links are only logged) |
| `MISTRAL_API_KEY` | secret | for the menu import |
| `ROOT_DOMAIN` | variable | only if not `barrechner.ch` |
| `EMAIL_FROM` | variable | optional |

The workflows use the GitHub environments `production` and `preview` (created on first use). Add
required reviewers to `production` if deploys should be approved, and protect `main` with the
*CI* checks as required status checks.

### 6. First production deploy

Merge this branch into `main` (or run `npx alchemy deploy --stage prod` locally with the same
environment variables). Afterwards check:

- `https://barrechner.ch` shows the landing page, `https://www.barrechner.ch` redirects to it;
- sign-up sends a verification email;
- a published bar is reachable at `https://{slug}.barrechner.ch`;
- *Workers & Pages → (worker) → Settings → Triggers* lists the cron `17 3 * * *`.

### 7. Migrating from the Supabase/Vercel version

The new version has its own user store. Supabase password hashes (bcrypt) are not portable to the new
PBKDF2 scheme, so existing owners need to register again (or use "Passwort vergessen" after an
import of their email addresses). Bar data can be moved by exporting `bars`, `bar_drafts` and
`bar_revisions` from Supabase and inserting the rows into D1 (`npx wrangler d1 execute` or the D1
console); the JSON configuration format is unchanged, image URLs must be re-uploaded to R2.
Once production runs on Cloudflare, remove the Vercel project, its domains and the Supabase project.
