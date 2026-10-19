"use client";

import { useRef, useState } from "react";
import {
  cancelBarImportAction,
  prepareBarImportAction,
  processBarImportAction,
} from "@/app/dashboard/actions";
import type { ImportProposal } from "@/lib/bar-import";
import { formatPrice } from "@/lib/format";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

type ImportMode = "replace" | "append";
type ImportStatus = "idle" | "uploading" | "ocr";

export default function BarCardImporter({
  barId,
  onApply,
}: {
  barId: string;
  onApply: (proposal: ImportProposal, mode: ImportMode) => boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<ImportProposal | null>(null);
  const [mode, setMode] = useState<ImportMode>("replace");
  const [acknowledged, setAcknowledged] = useState(false);
  const busy = status !== "idle";

  async function importFile(file: File) {
    setError("");
    setProposal(null);
    setAcknowledged(false);
    setFileName(file.name);
    if (!ALLOWED_TYPES.has(file.type)) {
      setError("Erlaubt sind PDF, PNG, JPEG und WebP.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      setError("Die Datei muss zwischen 1 Byte und 10 MB gross sein.");
      return;
    }

    let importId = "";
    try {
      setStatus("uploading");
      const prepared = await prepareBarImportAction(barId, { name: file.name, size: file.size, type: file.type });
      if (!prepared.ok) throw new Error(prepared.error);
      importId = prepared.importId;
      // The signed URL carries its own authorization, so the browser needs no Supabase client or keys.
      const uploaded = await fetch(prepared.uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type, "x-upsert": "false" },
        body: file,
      }).catch(() => null);
      if (!uploaded?.ok) throw new Error("Die Datei konnte nicht hochgeladen werden.");

      setStatus("ocr");
      const processed = await processBarImportAction(barId, prepared.importId);
      importId = "";
      if (!processed.ok) throw new Error(processed.error);
      setProposal(processed.proposal);
    } catch (caught) {
      if (importId) await cancelBarImportAction(barId, importId);
      setError(caught instanceof Error ? caught.message : "Import fehlgeschlagen.");
    } finally {
      setStatus("idle");
      if (input.current) input.current.value = "";
    }
  }

  function apply() {
    if (!proposal || (proposal.warnings.length > 0 && !acknowledged)) return;
    if (!onApply(proposal, mode)) return;
    setProposal(null);
    setFileName("");
    setAcknowledged(false);
  }

  const itemCount = proposal?.categories.reduce((sum, category) => sum + category.items.length, 0) ?? 0;

  return (
    <section className="import-panel" aria-labelledby="bar-import-title">
      <div className="section-heading">
        <span>AI</span>
        <div>
          <h2 id="bar-import-title">Barkarte importieren</h2>
          <p>PDF oder Foto hochladen, automatisch erkennen und vor dem Übernehmen prüfen.</p>
        </div>
      </div>

      <button
        type="button"
        className="import-dropzone"
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file && !busy) void importFile(file);
        }}
      >
        <strong>{status === "uploading" ? "Datei wird hochgeladen…" : status === "ocr" ? "Text und Kategorien werden erkannt…" : "PDF oder Bild auswählen"}</strong>
        <span>{fileName || "PDF, PNG, JPEG oder WebP · max. 10 MB / 20 Seiten"}</span>
      </button>
      <input
        ref={input}
        hidden
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); }}
      />
      <p className="import-privacy">Die Datei wird zur Erkennung an Mistral AI übermittelt und danach aus dem temporären Speicher gelöscht.</p>
      {error && <p className="import-error" role="alert">{error}</p>}

      {proposal && (
        <div className="import-preview">
          <div className="import-preview-heading">
            <div><strong>Erkannter Vorschlag</strong><span>{proposal.categories.length} Kategorien · {itemCount} Getränke</span></div>
            <button type="button" className="text-button danger" onClick={() => setProposal(null)}>Verwerfen</button>
          </div>

          {proposal.warnings.length > 0 && (
            <div className="import-warnings" role="status">
              <strong>{proposal.warnings.length} Hinweise prüfen</strong>
              <ul>{proposal.warnings.map((warning, index) => <li key={`${warning.path}-${index}`}>{warning.message}</li>)}</ul>
              <label><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /> Ich habe die unsicheren Zuordnungen geprüft.</label>
            </div>
          )}

          <div className="import-category-list">
            {proposal.categories.map((category) => (
              <article key={category.id} className="import-category">
                <h3><span>{category.emoji}</span>{category.name}</h3>
                <ul>
                  {category.items.map((item) => (
                    <li key={item.id}>
                      <div><strong>{item.name}</strong>{item.note && <small>{item.note}</small>}</div>
                      <span>{item.variants.map((variant) => `${variant.label}: ${variant.price === null ? "Preis fehlt" : formatPrice(variant.price)}`).join(" · ")}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <fieldset className="import-mode">
            <legend>Übernehmen als</legend>
            <label><input type="radio" name="import-mode" value="replace" checked={mode === "replace"} onChange={() => setMode("replace")} /> Bestehende Kategorien ersetzen</label>
            <label><input type="radio" name="import-mode" value="append" checked={mode === "append"} onChange={() => setMode("append")} /> An bestehende Kategorien anhängen</label>
          </fieldset>
          <button type="button" className="primary-button" disabled={proposal.warnings.length > 0 && !acknowledged} onClick={apply}>Vorschlag übernehmen</button>
        </div>
      )}
    </section>
  );
}
