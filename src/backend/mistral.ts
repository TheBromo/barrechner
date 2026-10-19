import { MAX_IMPORT_PAGES, validateImportProposal, type ImportProposal } from "~/lib/bar-import";
import { UserError } from "~/lib/errors";
import type { ImportMimeType } from "~/lib/files";
import { base64 } from "./encoding";

const MISTRAL_API = "https://api.mistral.ai/v1";
const MAX_OCR_CONTEXT_CHARS = 160_000;

type OcrPage = { markdown?: string; blocks?: Array<{ type?: string; content?: string; confidence_scores?: unknown }>; confidence_scores?: unknown };

const IMPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["categories", "warnings"],
  properties: {
    categories: {
      type: "array",
      minItems: 1,
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "emoji", "items"],
        properties: {
          name: { type: "string" },
          emoji: { type: "string" },
          items: {
            type: "array",
            minItems: 1,
            maxItems: 100,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "note", "variants"],
              properties: {
                name: { type: "string" },
                note: { type: "string" },
                variants: {
                  type: "array",
                  minItems: 1,
                  maxItems: 20,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["label", "priceChf", "uncertain", "uncertaintyReason"],
                    properties: {
                      label: { type: "string" },
                      priceChf: { anyOf: [{ type: "number" }, { type: "null" }] },
                      uncertain: { type: "boolean" },
                      uncertaintyReason: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    warnings: {
      type: "array",
      maxItems: 100,
      items: { type: "object", additionalProperties: false, required: ["path", "message"], properties: { path: { type: "string" }, message: { type: "string" } } },
    },
  },
} as const;

export const SYSTEM_PROMPT = [
  "Du extrahierst Barkarten in strukturiertes JSON.",
  "Bewahre ausdrücklich gedruckte Kategorien und deren Reihenfolge. Gruppiere nur ungeordnete oder unklare Positionen sinnvoll.",
  "Erfinde keine Getränke, Grössen oder Preise. Eine gedruckte Zahl ist in CHF.",
  "Wenn eine Preis- oder Grössenzuordnung plausibel, aber nicht sicher ist, gib den besten Wert aus, setze uncertain=true und erkläre ihn kurz auf Deutsch.",
  "Wenn es keinen vertretbaren Preis gibt, verwende priceChf=null und uncertain=true.",
  "Wenn keine Grösse angegeben ist, verwende label='Standard'.",
  "Schlage pro Kategorie genau ein passendes einzelnes Emoji vor.",
  "Nutze notes nur für echte Zusatzangaben aus der Karte. Gib gültiges JSON gemäss Schema zurück.",
].join(" ");

async function mistralFetch(apiKey: string, path: string, body: unknown, timeoutMs: number, fetcher: typeof fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(`${MISTRAL_API}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new UserError("Mistral hat zu lange für die Erkennung gebraucht. Bitte versuche es erneut.");
    }
    throw new UserError("Mistral ist momentan nicht erreichbar. Bitte versuche es später erneut.");
  }
  if (!response.ok) {
    if (response.status === 429) throw new UserError("Mistral ist momentan ausgelastet. Bitte versuche es später erneut.");
    throw new UserError(`Mistral-Anfrage fehlgeschlagen (${response.status}).`);
  }
  return response.json();
}

function ocrContext(pages: OcrPage[]): string {
  const context = pages
    .map((page, index) => {
      const structure = (page.blocks ?? []).slice(0, 500).map((block) => ({ type: block.type, content: block.content, confidence: block.confidence_scores }));
      return [`--- Seite ${index + 1} ---`, page.markdown ?? "", `Struktur und Konfidenz: ${JSON.stringify({ page: page.confidence_scores, blocks: structure })}`].join("\n");
    })
    .join("\n\n");
  if (context.length > MAX_OCR_CONTEXT_CHARS) throw new UserError("Die Barkarte enthält zu viel Text für einen einzelnen Import.");
  return context;
}

/** OCR the uploaded menu with Mistral and turn it into a validated, editor-only proposal. The file is never stored. */
export async function importBarCard(apiKey: string | undefined, bytes: Uint8Array, mimeType: ImportMimeType, fetcher: typeof fetch = fetch): Promise<ImportProposal> {
  if (!apiKey) throw new UserError("Der Barkarten-Import ist nicht konfiguriert.");
  const dataUrl = `data:${mimeType};base64,${base64(bytes)}`;
  const document = mimeType === "application/pdf" ? { type: "document_url", document_url: dataUrl } : { type: "image_url", image_url: dataUrl };
  const ocr = (await mistralFetch(apiKey, "/ocr", {
    model: "mistral-ocr-latest",
    document,
    // Zero-based and inclusive: one page more than the limit, so oversized documents are detected.
    pages: `0-${MAX_IMPORT_PAGES}`,
    include_blocks: true,
    confidence_scores_granularity: "block",
    table_format: "markdown",
  }, 65_000, fetcher)) as { pages?: OcrPage[] };
  if (!Array.isArray(ocr.pages) || ocr.pages.length === 0) throw new UserError("Mistral OCR konnte keinen Inhalt erkennen.");
  if (ocr.pages.length > MAX_IMPORT_PAGES) throw new UserError(`Die Barkarte darf höchstens ${MAX_IMPORT_PAGES} Seiten enthalten.`);

  const chat = (await mistralFetch(apiKey, "/chat/completions", {
    model: "mistral-small-latest",
    temperature: 0,
    max_tokens: 12_000,
    response_format: { type: "json_schema", json_schema: { name: "bar_card_import", strict: true, schema: IMPORT_SCHEMA } },
    messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: ocrContext(ocr.pages) }],
  }, 50_000, fetcher)) as { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> };

  const content = chat.choices?.[0]?.message?.content;
  const jsonText = typeof content === "string" ? content : Array.isArray(content) ? content.map((chunk) => chunk.text ?? "").join("") : "";
  if (!jsonText || jsonText.length > 1_000_000) throw new UserError("Mistral hat keine gültige Barkarte zurückgegeben.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new UserError("Mistral hat ein ungültiges Barkarten-Format zurückgegeben.");
  }
  return validateImportProposal(parsed);
}
