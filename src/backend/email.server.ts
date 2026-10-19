import { env } from "./env.server";
import { logError } from "~/lib/log";

type Email = { to: string; subject: string; text: string; html: string };

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function layout(title: string, paragraphs: string[], action: { label: string; url: string }) {
  const body = paragraphs.map((text) => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(text)}</p>`).join("");
  return `<!doctype html><html lang="de-CH"><body style="margin:0;background:#f5f3ec;font-family:Arial,Helvetica,sans-serif;color:#17201d">
<div style="max-width:520px;margin:0 auto;padding:32px 24px"><div style="display:inline-block;width:40px;height:40px;border-radius:12px;background:#101a17;color:#f3ba45;font-weight:900;font-size:20px;line-height:40px;text-align:center">B</div>
<h1 style="font-size:24px;margin:24px 0 16px">${escapeHtml(title)}</h1>${body}
<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#101a17;color:#ffffff;padding:12px 18px;border-radius:12px;font-weight:700;text-decoration:none">${escapeHtml(action.label)}</a></p>
<p style="font-size:12px;color:#7a8581;word-break:break-all">${escapeHtml(action.url)}</p></div></body></html>`;
}

export function verificationEmail(to: string, url: string): Email {
  const paragraphs = ["Bitte bestätige die E-Mail-Adresse deines Barrechner-Kontos. Der Link funktioniert auf jedem Gerät und ist 7 Tage gültig.", "Falls du kein Konto erstellt hast, kannst du diese E-Mail ignorieren."];
  return { to, subject: "E-Mail-Adresse bestätigen – Barrechner", text: `${paragraphs.join("\n\n")}\n\n${url}`, html: layout("E-Mail-Adresse bestätigen", paragraphs, { label: "E-Mail-Adresse bestätigen", url }) };
}

export function passwordResetEmail(to: string, url: string): Email {
  const paragraphs = ["Mit diesem Link kannst du ein neues Passwort für dein Barrechner-Konto festlegen. Er ist eine Stunde gültig und funktioniert auf jedem Gerät.", "Falls du das nicht angefordert hast, kannst du diese E-Mail ignorieren."];
  return { to, subject: "Neues Passwort festlegen – Barrechner", text: `${paragraphs.join("\n\n")}\n\n${url}`, html: layout("Neues Passwort festlegen", paragraphs, { label: "Neues Passwort festlegen", url }) };
}

/** Sends through Resend; without an API key (local development) the link is logged instead. */
export async function sendEmail(email: Email): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(JSON.stringify({ level: "info", event: "email.not_sent", reason: "RESEND_API_KEY missing", to: email.to, subject: email.subject, text: email.text }));
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const error = new Error(`Resend responded ${response.status}`);
    logError("email.send", error, { status: response.status });
    throw error;
  }
}
