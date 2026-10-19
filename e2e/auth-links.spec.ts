import { expect, test } from "@playwright/test";
import { emailLink } from "./mail";

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

test("verification and password-reset links work once, on any device", async ({ page, browser }) => {
  const email = `e2e-${unique()}@example.ch`;
  await page.goto("/registrieren");
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByLabel("Passwort").fill("passwort123");
  await page.getByRole("button", { name: "Konto erstellen" }).click();
  await expect(page.getByText(/Bitte bestätige deine E-Mail-Adresse/)).toBeVisible();

  // The verification link is opened in a fresh browser (another device) and confirmed with one click.
  const verifyLink = await emailLink(email, /bestätigen/);
  const otherDevice = await browser.newContext();
  const phone = await otherDevice.newPage();
  await phone.goto(verifyLink);
  await phone.getByRole("button", { name: "Weiter" }).click();
  await expect(phone.getByRole("heading", { name: "Deine Bars" })).toBeVisible();
  await expect(phone.getByText(/Bitte bestätige deine E-Mail-Adresse/)).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/Bitte bestätige deine E-Mail-Adresse/)).toHaveCount(0);

  // Links are single-use.
  const reused = await otherDevice.newPage();
  await reused.goto(verifyLink);
  await reused.getByRole("button", { name: "Weiter" }).click();
  await expect(reused.getByText("Dieser Link ist ungültig oder abgelaufen.", { exact: false })).toBeVisible();
  await otherDevice.close();

  // Password reset: the link session may set a new password without the old one.
  await page.getByRole("button", { name: "Abmelden" }).click();
  await page.goto("/passwort-vergessen");
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByRole("button", { name: "Link senden" }).click();
  await expect(page.getByText("Falls ein Konto existiert, haben wir einen Link gesendet.")).toBeVisible();
  await page.goto(await emailLink(email, /Passwort/));
  await page.getByRole("button", { name: "Weiter" }).click();
  await expect(page.getByRole("heading", { name: "Neues Passwort" })).toBeVisible();
  await expect(page.getByLabel("Aktuelles Passwort")).toHaveCount(0);
  await page.getByLabel("Neues Passwort").fill("neuesPasswort1");
  await page.getByRole("button", { name: "Passwort speichern" }).click();
  await expect(page.getByRole("heading", { name: "Deine Bars" })).toBeVisible();

  // A normal session must confirm the current password to change it.
  await page.getByRole("button", { name: "Abmelden" }).click();
  await page.goto("/anmelden");
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByLabel("Passwort").fill("neuesPasswort1");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Deine Bars" })).toBeVisible();
  await page.goto("/passwort-neu");
  await expect(page.getByLabel("Aktuelles Passwort")).toBeVisible();
});

test("unknown addresses get the same reset answer", async ({ page }) => {
  await page.goto("/passwort-vergessen");
  await page.getByLabel("E-Mail-Adresse").fill(`niemand-${unique()}@example.ch`);
  await page.getByRole("button", { name: "Link senden" }).click();
  await expect(page.getByText("Falls ein Konto existiert, haben wir einen Link gesendet.")).toBeVisible();
});
