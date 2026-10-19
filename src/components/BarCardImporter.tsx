import { useRef, useState } from "react";
import type { ImportProposal } from "~/lib/bar-import";
import { IMPORT_MIME_TYPES, MAX_IMPORT_BYTES } from "~/lib/bar-import";
import { formatPrice } from "~/lib/format";
import type { Result } from "~/lib/result";

export type ImportMode = "replace" | "append";
export type ImportFile = (file: File) => Promise<Result<{ proposal: ImportProposal }>>;

type Props = { enabled: boolean; importFile: ImportFile; onApply: (proposal: ImportProposal, mode: ImportMode) => boolean };

export default function BarCardImporter({ enabled, importFile, onApply }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<ImportProposal | null>(null);
  const [mode, setMode] = useState<ImportMode>("replace");
  const [acknowledged, setAcknowledged] = useState(false);

  async function start(file: File) {
    setError("");
    setProposal(null);
    setAcknowledged(false);
    setFileName(file.name);
    if (!(IMPORT_MIME_TYPES as readonly string[]).includes(file.type)) { setError("Erlaubt sind PDF, PNG, JPEG und WebP."); return; }
    if (file.size <= 0 || file.size > MAX_IMPORT_BYTES) { setError("Die Datei muss zwischen 1 Byte und 10 MB gross sein."); return; }
    setBusy(true);
    try {
      const result = await importFile(file);
      if (result.ok) setProposal(result.proposal);
      else setError(result.error);
    } catch {
      setError("Import fehlgeschlagen.");
    } finally {
      setBusy(false);
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
        <div><h2 id="bar-import-title">Barkarte importieren</h2><p>PDF oder Foto hochladen, automatisch erkennen und vor dem Übernehmen prüfen.</p></div>
      </div>
      {!enabled ? (
        <p className="import-disabled">Der Import ist auf dieser Installation nicht eingerichtet.</p>
      ) : (
        <>
          <button
            type="button" className="import-dropzone" disabled={busy}
            onClick={() => input.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file && !busy) void start(file); }}
          >
            <strong>{busy ? "Text und Kategorien werden erkannt…" : "PDF oder Bild auswählen"}</strong>
            <span>{fileName || "PDF, PNG, JPEG oder WebP · max. 10 MB / 20 Seiten"}</span>
          </button>
          <input ref={input} hidden type="file" aria-label="Barkarte hochladen" accept={IMPORT_MIME_TYPES.join(",")} onChange={(event) => { const file = event.target.files?.[0]; if (file) void start(file); }} />
          <p className="import-privacy">Die Datei wird zur Erkennung an Mistral AI übermittelt und danach aus dem temporären Speicher gelöscht.</p>
        </>
      )}
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
