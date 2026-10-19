import { expect, test, type Page } from "@playwright/test";

const base = new URL(process.env.E2E_BASE_URL ?? "http://localhost:1337");
const tenantUrl = (slug: string) => `${base.protocol}//${slug}.localhost:${base.port}/`;
const calculatorReady = (page: Page) => expect(page.locator('[data-ready="true"]')).toBeVisible();
const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function signUp(page: Page) {
  const email = `e2e-${unique()}@example.ch`;
  await page.goto("/registrieren");
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByLabel("Passwort").fill("passwort123");
  await page.getByRole("button", { name: "Konto erstellen" }).click();
  await expect(page.getByRole("heading", { name: "Deine Bars" })).toBeVisible();
  return email;
}

test("owner creates, edits and publishes a bar; the team uses the calculator", async ({ page, context }) => {
  page.on("dialog", (dialog) => dialog.accept());
  const email = await signUp(page);
  await expect(page.getByText(/Bitte bestätige deine E-Mail-Adresse bis am/)).toBeVisible();
  await expect(page.getByText("Noch 5 von 5 Plätzen frei.")).toBeVisible();

  // Create a bar; the address follows the name and is checked live.
  const slug = `e2e-${unique()}`;
  await page.getByRole("link", { name: "Erste Bar erstellen" }).click();
  await page.getByLabel("Name der Bar").fill("Test Bar");
  await page.getByLabel("Webadresse").fill(slug);
  await expect(page.getByText("Adresse ist verfügbar ✓")).toBeVisible();
  await page.getByRole("button", { name: "Bar erstellen" }).click();
  await expect(page.getByText("Noch nicht veröffentlicht")).toBeVisible();

  // Unpublished bars show a setup notice on their subdomain.
  const team = await context.newPage();
  await team.goto(tenantUrl(slug));
  await expect(team.getByRole("heading", { name: "Diese Bar wird gerade eingerichtet." })).toBeVisible();

  // Edit the starter menu: rename the bar, change the lager price, hide Panaché.
  await page.getByLabel("Sichtbarer Barname").fill("Sommerbar E2E");
  const lager = page.locator(".drink-editor").filter({ has: page.locator('input[value="Lager"]') });
  await lager.getByLabel("Preis in Franken").fill("5.50");
  const panache = page.locator(".drink-editor").filter({ has: page.locator('input[value="Panaché"]') });
  await panache.getByLabel("Im Rechner anzeigen").uncheck();
  await page.getByRole("button", { name: "Entwurf speichern" }).click();
  await expect(page.getByText("Entwurf gespeichert.")).toBeVisible();

  await page.getByRole("button", { name: "Veröffentlichen" }).click();
  await expect(page.getByText("Live · Version 1")).toBeVisible();

  // The bar team taps drinks and sees the total.
  await team.goto(tenantUrl(slug));
  await expect(team.getByRole("heading", { name: "Sommerbar E2E" })).toBeVisible();
  await expect(team.getByText("Panaché")).toHaveCount(0);
  await calculatorReady(team);
  await team.getByRole("button", { name: /Lager/ }).click();
  await team.getByRole("button", { name: /Lager/ }).click();
  await team.getByRole("button", { name: /Wein/ }).click();
  await team.getByRole("button", { name: /Weisswein.*1 dl/ }).click();
  await expect(team.getByTestId("order-total")).toHaveText("17.–");
  await expect(team.getByTestId("order-count")).toHaveText("3");

  // The order survives a reload of the same version…
  await team.reload();
  await calculatorReady(team);
  await expect(team.getByTestId("order-total")).toHaveText("17.–");

  // …and is cleared with a notice once a new version is published.
  await page.getByRole("button", { name: "Veröffentlichen" }).click();
  await expect(page.getByText("Live · Version 2")).toBeVisible();
  await team.reload();
  await calculatorReady(team);
  await expect(team.getByText("Die Getränkekarte wurde aktualisiert.")).toBeVisible();
  await expect(team.getByTestId("order-total")).toHaveText("0.–");

  // Renaming keeps a redirect from the old address.
  const renamed = `${slug}-neu`;
  await page.getByLabel("Webadresse").fill(renamed);
  await page.getByRole("button", { name: "Adresse ändern" }).click();
  await expect(page.getByText("Adresse geändert. Die alte Adresse leitet 30 Tage weiter.")).toBeVisible();
  await team.goto(tenantUrl(slug));
  await expect(team).toHaveURL(tenantUrl(renamed).replace(/\/$/, ""));
  await expect(team.getByRole("heading", { name: "Sommerbar E2E" })).toBeVisible();

  // Archive from the dashboard; the calculator goes offline publicly.
  await page.getByRole("link", { name: "← Alle Bars" }).click();
  await page.getByRole("button", { name: "Archivieren" }).click();
  await expect(page.getByRole("heading", { name: "Archiv" })).toBeVisible();
  await team.goto(tenantUrl(renamed));
  await expect(team.getByRole("heading", { name: "Diese Bar ist archiviert." })).toBeVisible();

  // Sign out and back in.
  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page.getByRole("heading", { name: /Tippen/ })).toBeVisible();
  await page.goto("/anmelden");
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByLabel("Passwort").fill("falsch123");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByText("E-Mail-Adresse oder Passwort ist falsch.")).toBeVisible();
  await page.getByLabel("Passwort").fill("passwort123");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Deine Bars" })).toBeVisible();
});

test("protected pages and endpoints require a session", async ({ page, request }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/anmelden$/);
  const response = await request.get("/dashboard/bars/00000000-0000-0000-0000-000000000000");
  expect(response.url()).toMatch(/\/anmelden$/);
  const tenant = await request.get("/dashboard", { headers: { host: `irgendwas.localhost:${base.port}` }, maxRedirects: 0 });
  expect(tenant.status()).toBe(404);
});

test("account deletion removes the account", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  const email = await signUp(page);
  await page.goto("/dashboard/konto");
  await expect(page.getByText(`Angemeldet als ${email}.`)).toBeVisible();
  await page.getByLabel("Passwort").fill("passwort123");
  await page.getByLabel(/Zur Bestätigung/).fill("LÖSCHEN");
  await page.getByRole("button", { name: "Konto endgültig löschen" }).click();
  await expect(page.getByRole("heading", { name: "Konto gelöscht" })).toBeVisible();
  await page.goto("/anmelden");
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByLabel("Passwort").fill("passwort123");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByText("E-Mail-Adresse oder Passwort ist falsch.")).toBeVisible();
});
