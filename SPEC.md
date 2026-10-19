# Barrechner — Product & Technical Specification

This document is the distilled specification of Barrechner as it existed in the
Next.js + Supabase + Vercel implementation (commit `17cecf4`). It describes
*what* the system does, independent of the framework that implements it. The
current implementation (TanStack Start on Cloudflare, provisioned by Alchemy)
is built against this document; where the platform forced a different
mechanism, the section **Platform mapping** at the end says how.

The product language is Swiss Standard German (`de-CH`); UI copy below is
quoted verbatim where it matters. The public calculator uses a few
Swiss-German phrases on purpose.

---

## 1. Product summary

Barrechner is a multi-tenant **price calculator for club festivals and small
bars**. A bar team taps drinks on a phone, sees the running total in Swiss
francs and clears the order after cashing up. Nothing is paid or recorded
online; it is a calculator, not a POS.

Two audiences:

| Audience | Where | What |
| --- | --- | --- |
| **Owner** (registered account) | `barrechner.ch` (platform host) | Creates and manages up to **5 active bars**: menu, prices, logo, colours, web address, publishing. |
| **Bar team** (anonymous) | `{slug}.barrechner.ch` (tenant host) | Uses the published calculator of one bar. Works offline once loaded. |

---

## 2. Hosts and routing

The root domain is configurable (default `barrechner.ch`).

* `www.{root}` → permanent redirect (308) to `https://{root}` with path and query preserved.
* `{root}` → **platform**: landing page, auth pages, dashboard.
* `{slug}.{root}` → **tenant**: the calculator of bar `slug`. Only the last
  label left of the root counts (`a.b.{root}` → slug `b`); `www` is never a slug.
* Local development: `localhost` / `127.0.0.1` are platform; `{slug}.localhost` is tenant.
* Deployment preview hosts (e.g. `*.workers.dev`) are platform.

Tenant hosts serve **only**: `/` (calculator), `/manifest.webmanifest`, the
service worker, static build assets, icons and uploaded bar images. Every other
path on a tenant host answers **404**. The platform host never renders a
calculator under a path (calculators only exist on their own subdomain so that
their service worker never controls the platform).

Origins: `platformOrigin()` = `https://{root}` (`http://localhost:3000` in dev);
`tenantOrigin(slug)` = `https://{slug}.{root}` (`http://{slug}.localhost:3000` in dev).

---

## 3. Data model

### 3.1 Bar configuration (`BarConfig`, JSON, schema version 1)

```ts
type Variant  = { id: string; label: string; price: number /* Rappen, integer */ };
type Drink    = { id: string; name: string; note?: string; active: boolean; variants: Variant[] };
type Category = { id: string; name: string; image: string; emoji: string; drinks: Drink[] };
type BarConfig = {
  schemaVersion: 1;
  revision: number;        // published version number, 0 for never-published drafts
  updatedAt: string;       // ISO timestamp
  displayName: string;
  logoUrl: string;         // "" or hosted image URL
  logoEmoji: string;       // "" or exactly one emoji
  theme: { background: string; accent: string }; // #rrggbb, lower-cased
  categories: Category[];
};
```

Validation (`sanitizeBarConfig`, applied to **all** owner input, server side,
and re-checked by the persistence layer):

* Strings are trimmed; required strings must be non-empty. Limits: display
  name 80, category name 80, drink name 100, variant label 40, note 200 (empty
  note is dropped).
* IDs match `^[a-zA-Z0-9_-]{1,64}$`. Category IDs are unique per bar, drink IDs
  unique per bar (across categories), variant IDs unique per drink.
* 1–30 categories; 0–100 drinks per category; 1–20 variants per drink.
* Price: number, rounded to integer Rappen, `0 ≤ price ≤ 10'000'000`.
* Colours: `#rrggbb` (case-insensitive input, stored lower-case).
* Images: `""`, or start with `/` or `https://`.
* Emoji: `""` or exactly **one** grapheme that contains emoji content
  (`Extended_Pictographic`, regional indicator or keycap), max 32 code units.
* Logo and each category may have **either** an image **or** an emoji, never both
  (`"Bitte wähle entweder ein Emoji oder ein Bild."`).
* `active` defaults to `true` unless explicitly `false`.
* `revision` is kept if a non-negative integer, else 0; `updatedAt` is set to now.
* Error messages are German and name the offending field, e.g.
  `"Lager, Preis 1: ungültiger Preis."`.

**Hosted images rule**: every image URL in a config must point to an image
uploaded *for this bar* through Barrechner (prefix = public image base +
`{ownerId}/{barId}/`), and must not contain `..`, `?` or `#`
(`"Bilder müssen über den Barrechner hochgeladen werden."`). Checked on save
and on publish.

### 3.2 Starter configuration

New bars start with the given name, colours (defaults background `#101a17`,
accent `#f3ba45`) and this menu:

* 🍺 **Bier** (`bier`): Lager 3 dl 5.–, Panaché 3 dl 5.–
* 🍷 **Wein** (`wein`): Weisswein 1 dl 6.–, 75 cl 36.–
* 🥤 **Alkoholfrei** (`alkoholfrei`): Mineralwasser 3 dl 3.–, Softdrink 3 dl 4.–

### 3.3 Persistent entities

| Entity | Fields | Notes |
| --- | --- | --- |
| **User** | id, email (unique, lower-case), password hash, created_at, email-verified-at, verification-required-by | |
| **Session** | token (hashed at rest), user, created_at, expires_at, auth method + time | auth method `password` or `email_link` |
| **Email token** | token hash, user, purpose (`verify_email` / `reset_password`), expires_at, used_at | single use |
| **Bar** | id, owner, slug (unique, case-insensitive), label, status `active`/`archived`, archived_at, current_revision_id, created/updated | slug regex `^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$` |
| **Draft** | bar (1:1), config, updated_at | always exists for a bar |
| **Revision** | id, bar, version (1, 2, …, unique per bar), config, created_by, created_at | immutable |
| **Slug redirect** | old_slug (PK), bar, expires_at | 30 days |
| **Asset** | id, owner, bar, storage key, public URL, kind `logo`/`category`, created_at | uploaded images |
| **Rate limit** | key, attempts, window_started_at | fixed window |

Deleting a user cascades to everything they own. Deleting a bar cascades to its
draft, revisions, redirects and assets.

---

## 4. Slugs (web addresses)

* `normalizeSlug`: NFKD, strip diacritics, lower-case, every run of
  non-`[a-z0-9]` → `-`, trim dashes, cut to 32, trim trailing dashes again
  (`"Café Zürich!"` → `"cafe-zurich"`).
* `validateSlug`: normalised length ≥ 3 (`"Die Adresse muss mindestens 3 Zeichen lang sein."`),
  must match the slug regex, must not be reserved
  (`admin, api, app, auth, dashboard, hilfe, status, support, www` →
  `"Diese Adresse ist reserviert."`).
* A slug is **taken** if another bar uses it, or if an unexpired slug redirect
  owned by **another** bar points from it (`"Diese Adresse ist vorübergehend reserviert"`).
* Duplicate slug → `"Diese Adresse ist bereits vergeben."`.
* Availability endpoint `GET /api/slug-availability?slug=` → `{ slug, available }`
  or `400 { available:false, error }`; rate-limited (80/h per IP); `no-store`.

---

## 5. Owner features

All owner actions require a signed-in user whose email verification is not
overdue (§7.3). Every mutation verifies ownership on the server.

### 5.1 Bar lifecycle (all atomic)

* **Create** (`name`, `slug`, `background`, `accent`): name required (≤80);
  slug validated; fails when the owner already has 5 active bars
  (`"Maximal fünf aktive Bars sind erlaubt"`); creates bar + draft (starter
  config) and redirects to the editor. Rate limit 8/h.
* **Save draft**: sanitise, hosted-images check, store draft, set bar label =
  display name.
* **Publish**: bar must be active; re-validate draft and hosted images; next
  version = max+1; stamp `revision` and `updatedAt` into the config; insert
  revision; point bar to it; write the stamped config back to the draft.
  Rate limit 20/h. Confirmation dialog `"Diese Version jetzt für das Barteam veröffentlichen?"`.
  Unsaved changes are saved first.
* **Discard draft**: replace draft with the current published config; fails
  without published version (`"Noch keine veröffentlichte Version vorhanden"`).
* **Rename (change slug)**: active bars only; unchanged slug is a no-op;
  validates; blocked by other bars' live redirects; an owner may move back to
  one of the bar's own previous slugs (its redirect is removed); stores a
  30-day redirect from the old slug. Rate limit 10/h. Message:
  `"Adresse geändert. Die alte Adresse leitet 30 Tage weiter."`.
* **Archive**: active → archived (sets archived_at). Archived bars show
  `"Diese Bar ist archiviert."` publicly and are deleted after 30 days.
* **Restore**: archived → active, only if fewer than 5 active bars
  (`"Für die Wiederherstellung muss ein Platz frei sein"`).

### 5.2 Dashboard (`/dashboard`)

* Header: brand, email (link to account), "Abmelden".
* Grace-period banner (§7.3): `"Bitte bestätige deine E-Mail-Adresse bis am {date}."` + resend link.
* "Deine Bars", `"Noch {n} von 5 Plätzen frei."`, "Neue Bar erstellen" while slots remain.
* Empty state with "Erste Bar erstellen".
* Card per active bar: status pill (`"Live · Version {n}"` / `"Noch nicht veröffentlicht"`),
  label, `{slug}.{root}`, actions Bearbeiten / Rechner öffnen (if published) / Archivieren.
* Archive section: `"Diese Bars werden nach 30 Tagen dauerhaft gelöscht."` + Wiederherstellen.

### 5.3 New bar (`/dashboard/bars/neu`)

Name, web address (auto-derived from the name until edited manually; live
availability check debounced 350 ms showing `"Adresse ist verfügbar ✓"` or the
error), two colour pickers, sample-menu note, submit/cancel.

### 5.4 Editor (`/dashboard/bars/{id}`)

Sections:

1. **Auftritt** – display name, logo (icon editor), background and accent colour.
2. **Webadresse** – slug input + "Adresse ändern".
3. **Getränkekarte** – AI import panel (§5.6), category editors, "＋ Kategorie hinzufügen".

* Category editor: name, move up/down, delete (confirm), icon editor, drinks.
  New category: `"Neue Kategorie"`, emoji 🍹, no drinks.
* Drink editor: name, optional note, move up/down, delete, "Im Rechner
  anzeigen" (active), variants (label + price in CHF, live formatted preview),
  "＋ Variante". New drink: empty name, variant `"3 dl"` with empty price.
* Price input accepts `5`, `5.5`, `5.50`, `5,50`, apostrophes; invalid →
  `"{drink}: Preis «{value}» ist ungültig."`.
* Icon editor: preview, emoji palette (logo: 🍺🍻🍷🍹🥂🎉🎪🎸⭐❤️🔥🏔️;
  category: 🍺🍷🥂🍹🥤☕🍵🧃💧🥨🍕🍔), custom emoji input
  (`"Bitte genau ein Emoji eingeben."`), image upload (PNG/JPEG/WebP ≤ 4 MB),
  remove. Choosing one clears the other.
* Sticky footer: status message, "Entwurf verwerfen" (only if published),
  "Entwurf speichern" (enabled when dirty), "Veröffentlichen".
* Header: back link, status pills (live version / `"Ungespeicherte Änderungen"`),
  "Vorschau" (draft preview, new tab), "Live öffnen" (if published).
* Leaving with unsaved changes triggers the browser's beforeunload warning.

### 5.5 Image upload

* Accept PNG, JPEG, WebP only, verified by **file content** (magic bytes), not
  just the declared type; ≤ 4 MB; max 24 megapixels.
* Downscale to fit 800×800 (logo) / 1200×1200 (category) without
  enlargement, re-encode as WebP.
* Stored under `{ownerId}/{barId}/{uuid}.webp`, immutable cache headers, an
  asset row is recorded. Rate limit 40/h.
* Unreferenced assets (not used by the bar's draft or current revision) older
  than one day are deleted by the daily cleanup.

### 5.6 AI menu import ("Barkarte importieren")

* Input: PDF, PNG, JPEG or WebP, ≤ 10 MB, ≤ 20 pages; type verified by magic bytes.
* Privacy note: `"Die Datei wird zur Erkennung an Mistral AI übermittelt und danach aus dem temporären Speicher gelöscht."`
* Pipeline: Mistral OCR (`mistral-ocr-latest`, blocks + confidence, markdown
  tables) → Mistral chat (`mistral-small-latest`, temperature 0, strict JSON
  schema) with a German system prompt: keep printed categories and order,
  never invent drinks/sizes/prices, prices are CHF, uncertain mappings get
  `uncertain=true` + German reason, missing price → `null`, missing size →
  `"Standard"`, exactly one emoji per category.
* The response is untrusted and validated (`validateImportProposal`): 1–30
  categories, each with a valid single emoji and 1–100 items, each item 1–20
  variants; price CHF → Rappen, must be exact to the Rappen and in range;
  uncertain or missing prices produce warnings (`"{item}: Preis muss ergänzt werden."` /
  `"{item}: Preiszuordnung bitte prüfen."` / the model's reason); model
  warnings are appended (max 100); duplicates removed; fresh IDs generated.
* OCR context limit 160 000 characters; more than 20 pages is rejected.
* Timeouts and errors map to friendly messages (timeout, unreachable,
  429 busy, other status codes).
* Preview: counts, warnings with mandatory acknowledgement checkbox, list of
  categories/items/prices (`"Preis fehlt"`), mode **replace** or **append**,
  "Vorschlag übernehmen". Append fails above 30 categories; replace asks for
  confirmation when the menu has unsaved changes. Imported drinks are active;
  missing prices become empty inputs the owner must fill before saving.
* Rate limit 10 imports/h. The uploaded file is never kept after processing.

### 5.7 Draft preview (`/dashboard/bars/{id}/vorschau`)

The calculator rendered from the **draft**, banner "Entwurfsvorschau" + back
link, no service worker, separate order storage key.

### 5.8 Account (`/dashboard/konto`)

Shows email; link to change password; **delete account** requires the
current password and typing `LÖSCHEN`. Deletes all stored images, then the
user (cascade), signs out and shows `/konto-geloescht`. Rate limit 5/h.

---

## 6. Public calculator (tenant `/`)

### 6.1 Resolution

| State | Response |
| --- | --- |
| Bar with published revision, active | calculator using the **published** config (`revision` = version) |
| Slug is a live redirect to an active bar | redirect to the new tenant origin |
| Bar archived | `"Diese Bar ist archiviert."` / `"Der Rechner ist zurzeit nicht verfügbar."` |
| Bar never published | `"Diese Bar wird gerade eingerichtet."` / `"Sobald die Getränkekarte veröffentlicht ist, erscheint hier der Rechner."` |
| Unknown | `"Bar nicht gefunden."` / `"Prüfe die eingegebene Webadresse."` |

Status pages link back to the platform. Non-published states are `noindex`.

### 6.2 Calculator behaviour

* Theme from bar colours (§6.3). Header: logo image / logo emoji / first
  letter, display name, "Barrechner", gear link to the platform dashboard
  (`aria-label="Bar verwalten"`).
* Category chips (only categories with at least one active drink), first one
  selected; chip shows image, emoji or 🍹.
* Grid of buttons: one per **active drink × variant**, showing name, note,
  variant label, formatted price and a quantity badge.
* Tapping adds 1 (lines keyed `drinkId:variantId`).
* Footer: item count, hint (`"Kei Artikel — tipp uf es Getränk"` /
  `"Bstellig aaluege"` / `"Zuäklappe"`), total, chevron. Opens the order sheet
  when count > 0.
* Order sheet: `"Tippe uf ä Zilä zum eis wägnäh"`; each line `{qty}×`, name,
  label · unit price, line total; tapping removes one. "Alles lösche" needs a
  second tap within 2.5 s (`"Würkli? Nomal tippe zum lösche"`).
* **Order persistence**: order is stored in `localStorage` under
  `barrechner-order:{slug}` as `{ revision, lines }`. On load, lines are
  validated; if the stored revision differs from the published one, the order
  is discarded and the notice `"Die Getränkekarte wurde aktualisiert. Die alte Bestellung wurde geleert."`
  is shown (dismiss "OK"). Orders never leave the device.

### 6.3 Theme

From background and accent colours compute CSS variables: surface (8 % mix
toward black/white depending on background luminance > 0.45), strong surface
(16 %), text (black/white by higher WCAG contrast), muted/border (mixed text,
adjusted to ≥ 4.5 / ≥ 3 contrast against all surfaces), accent, accent text,
accent ink (accent made readable ≥ 4.5), danger (`#ef4444` made readable).
`readableColor` keeps the colour when already readable, else binary-searches
the minimal mix toward the better of black/white.

### 6.4 Price formatting

Rappen → Swiss menu style: `500` → `"5.–"`, `1750` → `"17.50"`, thousands
separator `’` (`123456` → `"1’234.56"`).

### 6.5 Offline & PWA

* Per-bar web manifest (`name: "{bar} – Barrechner"`, `short_name` ≤ 24,
  `start_url: "/"`, standalone, colours from theme, 192/512 icons,
  `public, max-age=300`). Platform manifest uses "Barrechner".
* Service worker (tenant only, not in preview): caches the calculator page
  (`/`) network-first with a 3.5 s timeout fallback to cache, caches immutable
  build assets, icons and images cache-first; after registration the page asks
  the worker to pre-cache `/`, loaded same-origin resources and the bar's
  images. Versioned cache name; old caches deleted on activate.

---

## 7. Authentication

### 7.1 Pages

| Path | Purpose |
| --- | --- |
| `/anmelden` | Login (redirects to dashboard if signed in). `?fehler=link` shows `"Dieser Link ist ungültig oder abgelaufen. …"` |
| `/auth/link` | Landing page of emailed links: one click on "Weiter" redeems the token |
| `/registrieren` | Sign-up |
| `/passwort-vergessen` | Request reset link |
| `/passwort-neu` | Set new password (signed-in only, else → `/passwort-vergessen`) |
| `/email-bestaetigen` | Verification status + resend + sign out |
| `/konto-geloescht` | Goodbye page |

### 7.2 Rules

* Email must match `^\S+@\S+\.\S+$` (lower-cased); password ≥ 8 characters.
* Login failure: `"E-Mail-Adresse oder Passwort ist falsch."` (rate limit 8 / 15 min).
* Sign-up: existing email → `"Für diese E-Mail-Adresse besteht bereits ein Konto."`;
  creates the user, signs them in, sends a verification email, redirects to
  the dashboard (rate limit 5/h).
* Password reset request always answers
  `"Falls ein Konto existiert, haben wir einen Link gesendet."` (4/h).
* Emailed links work on **any device** (no same-browser requirement), are
  single-use and expire (verification 7 days, reset 1 hour). Opening one shows a
  confirmation page; the token is redeemed only on an explicit click (so mail
  scanners that prefetch links cannot burn it). Redeeming signs the user in,
  marks the email as verified and redirects to a safe `next` path (only
  same-origin relative paths, no `//`, no backslashes; default `/dashboard`).
  Invalid or used links show `"Dieser Link ist ungültig oder abgelaufen. …"` with
  a way to request a new one.
* Changing the password requires the current password **unless** the session
  was created by an emailed link within the last **15 minutes**. New password
  must differ (`"Das neue Passwort muss sich vom bisherigen unterscheiden."`). (6/h)
* Sign out ends the session and redirects to `/`.

### 7.3 Email verification grace period

New accounts may be used for **30 days** without verifying. State:
`verified` (verified-at set, or legacy account without a deadline),
`grace` (before deadline) or `required` (deadline passed / invalid date).
`required` users are redirected from the dashboard to `/email-bestaetigen`.
Resend is rate-limited (4/h).

---

## 8. Security requirements

* All owner input sanitised server side; data layer re-validates configs.
* Ownership enforced on every read/write of bars, drafts, revisions, assets.
* Public calculator reads only the published revision.
* Fixed-window rate limits keyed by SHA-256(`scope:client-ip`).
* User-facing errors: only messages written for users are shown; anything
  else (database, storage, programming errors) shows
  `"Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut."`.
  Unique-slug violations map to `"Diese Adresse ist bereits vergeben."`.
* Structured JSON error logs `{ level, event, message, errorCode?, …context, at }`.
* Security headers on all responses: HSTS (2 years, subdomains), `nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
  restrictive `Permissions-Policy`, CSP `frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'`.
  Authenticated pages are `private, no-store`.
* Secrets (database/admin keys, Mistral key, mail key, cron secret) are server-only.

---

## 9. Scheduled cleanup (daily, 03:17 UTC)

1. Delete stored images of bars archived more than 30 days ago.
2. Delete expired slug redirects, bars archived > 30 days (cascade) and rate-limit rows older than a day.
3. Delete expired sessions and email tokens.
4. Delete unreferenced assets older than one day (batch of 500).

---

## 10. Landing page (`/` on the platform)

Nav (brand, Anmelden, "Kostenlos starten"), hero `"Tippen. / Total sehen. / Weiterfeiern."`
with lead text, CTAs, `"Kostenlos · bis zu 5 Bars · keine Serverkonten nötig"`,
an illustrated phone mock of the calculator with an "● Funktioniert offline"
badge, three steps (Bar erstellen / Karte anpassen / Link teilen) and a footer.
Metadata: title `"Barrechner – Schnell kassieren am Fest"`, description,
Open Graph image `/og.png`, locale `de_CH`, theme colour `#101a17`.

Generic pages: not found (`"Seite nicht gefunden"`), error with retry.

---

## 11. Non-functional

* Mobile-first; the calculator is a full-height POS-like layout with safe-area padding.
* Offline-capable calculator after first load.
* Limits as listed; all destructive operations confirmed.
* Tested: domain logic (validation, slugs, prices, theme, order storage,
  import validation, error mapping, redirects, verification, hosts),
  data-layer invariants and UI behaviour of calculator/editor/importer.

---

## Platform mapping (current implementation)

| Concern | Next.js / Supabase / Vercel (old) | TanStack Start / Cloudflare / Alchemy (new) |
| --- | --- | --- |
| Framework | Next.js 16 App Router, Server Actions | TanStack Start (React 19), TanStack Router, server functions |
| Hosting | Vercel, wildcard domain | Cloudflare Worker (Alchemy `Cloudflare.Website.Vite`), zone routes `{root}/*` and `*.{root}/*` |
| Database | Supabase Postgres, RLS, PL/pgSQL functions | Cloudflare D1 (SQLite); invariants enforced by guarded single statements / `batch` transactions in the data layer |
| Auth | Supabase Auth | Built-in: PBKDF2-SHA256 password hashes, opaque session cookies, hashed single-use email tokens |
| Email | Supabase Auth mailer | Resend HTTP API (console log when not configured) |
| Images | Supabase Storage + `sharp` | Cloudflare R2, served by the Worker under `/img/…`; resized to WebP in the browser, magic bytes + dimensions verified on the server |
| Import upload | Signed upload URL to a private bucket | Direct upload to a server function, forwarded to Mistral as a data URL; never stored |
| Cron | Vercel Cron → HTTP endpoint with bearer secret | Worker Cron Trigger (`scheduled` handler) |
| Preview deployments | Vercel preview URL (platform only) | `*.workers.dev` URL; calculators open via `/?bar={slug}` (no service worker) |
| Infrastructure | Dashboard clicks | `alchemy.run.ts` (D1, R2, Worker, routes, DNS, secrets) |
