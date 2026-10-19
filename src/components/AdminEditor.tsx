import { useEffect, useState, useTransition } from "react";
import { Link } from "@tanstack/react-router";
import type { BarConfig } from "~/lib/types";
import type { ImportProposal } from "~/lib/bar-import";
import { formatPrice, parsePrice, priceInput } from "~/lib/format";
import type { Result } from "~/lib/result";
import BarCardImporter, { type ImportFile, type ImportMode } from "./BarCardImporter";
import IconEditor, { type IconValue, type UploadImage } from "./IconEditor";

type DraftVariant = { id: string; label: string; price: string };
type DraftDrink = { id: string; name: string; note: string; active: boolean; variants: DraftVariant[] };
type DraftCategory = { id: string; name: string; image: string; emoji: string; drinks: DraftDrink[] };

/** Everything the editor does on the server, injected so the component is testable in isolation. */
export type EditorActions = {
  save: (config: BarConfig) => Promise<Result>;
  publish: () => Promise<Result<{ version: number }>>;
  discard: () => Promise<Result>;
  rename: (slug: string) => Promise<Result<{ slug: string }>>;
  upload: UploadImage;
  importFile: ImportFile;
  /** Reload the editor's data after a change on the server. */
  refresh: () => Promise<void>;
};

type Props = {
  menu: BarConfig;
  barId: string;
  slug: string;
  publishedRevision: number | null;
  liveUrl: string;
  importEnabled: boolean;
  actions: EditorActions;
};

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

function move<T>(items: T[], from: number, to: number) {
  if (to < 0 || to >= items.length) return items;
  const copy = [...items];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

function draftCategories(config: BarConfig): DraftCategory[] {
  return config.categories.map((category) => ({
    ...category,
    emoji: category.emoji ?? "",
    drinks: category.drinks.map((drink) => ({
      ...drink,
      note: drink.note ?? "",
      variants: drink.variants.map((variant) => ({ ...variant, price: priceInput(variant.price) })),
    })),
  }));
}

function importedDraftCategories(proposal: ImportProposal): DraftCategory[] {
  return proposal.categories.map((category) => ({
    id: category.id,
    name: category.name,
    image: "",
    emoji: category.emoji,
    drinks: category.items.map((item) => ({
      id: item.id,
      name: item.name,
      note: item.note,
      active: true,
      variants: item.variants.map((variant) => ({ id: variant.id, label: variant.label, price: variant.price === null ? "" : priceInput(variant.price) })),
    })),
  }));
}

export default function AdminEditor({ menu, barId, slug, publishedRevision, liveUrl, importEnabled, actions }: Props) {
  const [name, setName] = useState(menu.displayName);
  const [logo, setLogo] = useState<IconValue>({ image: menu.logoUrl, emoji: menu.logoEmoji ?? "" });
  const [background, setBackground] = useState(menu.theme.background);
  const [accent, setAccent] = useState(menu.theme.accent);
  const [nextSlug, setNextSlug] = useState(slug);
  const [categories, setCategories] = useState(() => draftCategories(menu));
  const [dirty, setDirty] = useState(false);
  const [categoriesDirty, setCategoriesDirty] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function changed() { setDirty(true); setMessage(null); }
  function categoriesChanged() { setCategoriesDirty(true); changed(); }

  function buildConfig(): BarConfig {
    return {
      ...menu,
      displayName: name,
      logoUrl: logo.image,
      logoEmoji: logo.emoji,
      theme: { background, accent },
      categories: categories.map((category) => ({
        ...category,
        drinks: category.drinks.map((drink) => ({
          id: drink.id,
          name: drink.name,
          ...(drink.note.trim() ? { note: drink.note.trim() } : {}),
          active: drink.active,
          variants: drink.variants.map((variant) => {
            const price = parsePrice(variant.price);
            if (Number.isNaN(price)) throw new Error(`${drink.name || "Getränk"}: Preis «${variant.price}» ist ungültig.`);
            return { id: variant.id, label: variant.label, price };
          }),
        })),
      })),
    };
  }

  async function saveNow() {
    const result = await actions.save(buildConfig());
    if (!result.ok) throw new Error(result.error);
    setDirty(false);
    setCategoriesDirty(false);
  }

  function run(task: () => Promise<void>, fallback: string) {
    startTransition(async () => {
      try { await task(); } catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : fallback }); }
    });
  }

  function save() {
    run(async () => { await saveNow(); setMessage({ type: "ok", text: "Entwurf gespeichert." }); await actions.refresh(); }, "Speichern fehlgeschlagen.");
  }

  function publish() {
    if (!window.confirm("Diese Version jetzt für das Barteam veröffentlichen?")) return;
    run(async () => {
      if (dirty) await saveNow();
      const result = await actions.publish();
      if (!result.ok) throw new Error(result.error);
      setMessage({ type: "ok", text: "Neue Version ist live." });
      await actions.refresh();
    }, "Veröffentlichung fehlgeschlagen.");
  }

  function discard() {
    if (!window.confirm("Entwurf verwerfen und die veröffentlichte Version wiederherstellen?")) return;
    run(async () => {
      const result = await actions.discard();
      if (!result.ok) throw new Error(result.error);
      setDirty(false);
      setCategoriesDirty(false);
      await actions.refresh();
    }, "Verwerfen fehlgeschlagen.");
  }

  function rename() {
    run(async () => {
      const result = await actions.rename(nextSlug);
      if (!result.ok) throw new Error(result.error);
      setMessage({ type: "ok", text: "Adresse geändert. Die alte Adresse leitet 30 Tage weiter." });
      await actions.refresh();
    }, "Die Adresse konnte nicht geändert werden.");
  }

  function applyImport(proposal: ImportProposal, mode: ImportMode): boolean {
    const imported = importedDraftCategories(proposal);
    if (mode === "append" && categories.length + imported.length > 30) {
      setMessage({ type: "error", text: "Mit dem Import wären mehr als 30 Kategorien vorhanden." });
      return false;
    }
    if (mode === "replace" && categoriesDirty && !window.confirm("Ungespeicherte Änderungen an der Getränkekarte durch den Import ersetzen?")) return false;
    setCategories(mode === "replace" ? imported : [...categories, ...imported]);
    setCategoriesDirty(true);
    setDirty(true);
    setMessage({ type: "ok", text: "Import übernommen. Bitte prüfen und den Entwurf speichern." });
    return true;
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8 pb-36 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/dashboard" className="back-link">← Alle Bars</Link>
          <div className="mt-4 flex items-center gap-3">
            <p className="status-pill">{publishedRevision ? `Live · Version ${publishedRevision}` : "Noch nicht veröffentlicht"}</p>
            {dirty && <p className="status-pill draft">Ungespeicherte Änderungen</p>}
          </div>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] text-slate-950">{name || "Unbenannte Bar"}</h1>
        </div>
        <div className="flex gap-2">
          <Link to="/dashboard/bars/$barId/vorschau" params={{ barId }} target="_blank" className="secondary-button small">Vorschau</Link>
          {publishedRevision && <a href={liveUrl} target="_blank" rel="noreferrer" className="secondary-button small">Live öffnen</a>}
        </div>
      </div>

      <section className="editor-panel mt-8">
        <div className="section-heading"><span>01</span><div><h2>Auftritt</h2><p>Name, Logo und Farben des Rechners.</p></div></div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className="field-label self-start">Sichtbarer Barname<input value={name} onChange={(event) => { setName(event.target.value); changed(); }} className="field-input" maxLength={80} /></label>
          <IconEditor label="Logo" value={logo} kind="logo" upload={actions.upload} onChange={(value) => { setLogo(value); changed(); }} />
          <label className="color-field"><input type="color" aria-label="Grundfarbe" value={background} onChange={(event) => { setBackground(event.target.value); changed(); }} /><span><strong>Grundfarbe</strong><small>{background}</small></span></label>
          <label className="color-field"><input type="color" aria-label="Akzentfarbe" value={accent} onChange={(event) => { setAccent(event.target.value); changed(); }} /><span><strong>Akzentfarbe</strong><small>{accent}</small></span></label>
        </div>
      </section>

      <section className="editor-panel mt-5">
        <div className="section-heading"><span>02</span><div><h2>Webadresse</h2><p>Beim Umbenennen leitet die bisherige Adresse 30 Tage weiter.</p></div></div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input value={nextSlug} aria-label="Webadresse" onChange={(event) => setNextSlug(event.target.value.toLowerCase())} className="field-input font-mono" />
          <button disabled={pending || nextSlug === slug} onClick={rename} className="secondary-button shrink-0">Adresse ändern</button>
        </div>
      </section>

      <section className="mt-5 space-y-4">
        <div className="section-heading px-1"><span>03</span><div><h2>Getränkekarte</h2><p>Die Reihenfolge wird im Rechner übernommen.</p></div></div>
        <BarCardImporter enabled={importEnabled} importFile={actions.importFile} onApply={applyImport} />
        {categories.map((category, categoryIndex) => (
          <CategoryEditor
            key={category.id}
            category={category}
            upload={actions.upload}
            onChange={(next) => { setCategories((all) => all.map((item) => (item.id === category.id ? next : item))); categoriesChanged(); }}
            onMove={(direction) => { setCategories((all) => move(all, categoryIndex, categoryIndex + direction)); categoriesChanged(); }}
            onDelete={() => { if (window.confirm("Kategorie wirklich löschen?")) { setCategories((all) => all.filter((item) => item.id !== category.id)); categoriesChanged(); } }}
          />
        ))}
        <button onClick={() => { setCategories((all) => [...all, { id: newId("cat"), name: "Neue Kategorie", image: "", emoji: "🍹", drinks: [] }]); categoriesChanged(); }} className="add-button">＋ Kategorie hinzufügen</button>
      </section>

      <div className="editor-footer">
        <div className={`editor-message ${message?.type ?? ""}`} role={message?.type === "error" ? "alert" : "status"}>{message?.text ?? (dirty ? "Änderungen noch nicht gespeichert" : "Entwurf ist gespeichert")}</div>
        {publishedRevision && <button disabled={pending} onClick={discard} className="text-button">Entwurf verwerfen</button>}
        <button disabled={pending || !dirty} onClick={save} className="secondary-button">{pending ? "Bitte warten…" : "Entwurf speichern"}</button>
        <button disabled={pending} onClick={publish} className="primary-button">Veröffentlichen</button>
      </div>
    </main>
  );
}

function CategoryEditor({ category, upload, onChange, onMove, onDelete }: { category: DraftCategory; upload: UploadImage; onChange: (value: DraftCategory) => void; onMove: (direction: -1 | 1) => void; onDelete: () => void }) {
  return (
    <article className="category-editor" aria-label={`Kategorie ${category.name}`}>
      <div className="flex flex-wrap items-center gap-2">
        <input value={category.name} aria-label="Kategoriename" onChange={(event) => onChange({ ...category, name: event.target.value })} className="field-input min-w-52 flex-1 text-lg font-bold" />
        <button onClick={() => onMove(-1)} className="icon-button" aria-label="Kategorie nach oben">↑</button>
        <button onClick={() => onMove(1)} className="icon-button" aria-label="Kategorie nach unten">↓</button>
        <button onClick={onDelete} className="icon-button danger" aria-label="Kategorie löschen">×</button>
      </div>
      <div className="mt-3">
        <IconEditor label="Kategorie-Icon" value={{ image: category.image, emoji: category.emoji }} kind="category" compact upload={upload} onChange={(value) => onChange({ ...category, image: value.image, emoji: value.emoji })} />
      </div>
      <div className="mt-4 space-y-3">
        {category.drinks.map((drink, drinkIndex) => (
          <DrinkEditor
            key={drink.id}
            drink={drink}
            onChange={(next) => onChange({ ...category, drinks: category.drinks.map((item) => (item.id === drink.id ? next : item)) })}
            onMove={(direction) => onChange({ ...category, drinks: move(category.drinks, drinkIndex, drinkIndex + direction) })}
            onDelete={() => onChange({ ...category, drinks: category.drinks.filter((item) => item.id !== drink.id) })}
          />
        ))}
      </div>
      <button onClick={() => onChange({ ...category, drinks: [...category.drinks, { id: newId("drink"), name: "", note: "", active: true, variants: [{ id: newId("variant"), label: "3 dl", price: "" }] }] })} className="add-button compact">＋ Getränk</button>
    </article>
  );
}

function DrinkEditor({ drink, onChange, onMove, onDelete }: { drink: DraftDrink; onChange: (value: DraftDrink) => void; onMove: (direction: -1 | 1) => void; onDelete: () => void }) {
  const updateVariant = (id: string, patch: Partial<DraftVariant>) => onChange({ ...drink, variants: drink.variants.map((item) => (item.id === id ? { ...item, ...patch } : item)) });
  return (
    <div className={`drink-editor ${drink.active ? "" : "inactive"}`}>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input value={drink.name} onChange={(event) => onChange({ ...drink, name: event.target.value })} placeholder="Getränkename" aria-label="Getränkename" className="field-input" />
        <input value={drink.note} onChange={(event) => onChange({ ...drink, note: event.target.value })} placeholder="Optionale Beschreibung" aria-label="Beschreibung" className="field-input" />
        <div className="flex gap-1">
          <button onClick={() => onMove(-1)} className="icon-button" aria-label="Getränk nach oben">↑</button>
          <button onClick={() => onMove(1)} className="icon-button" aria-label="Getränk nach unten">↓</button>
          <button onClick={onDelete} className="icon-button danger" aria-label="Getränk löschen">×</button>
        </div>
      </div>
      <label className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
        <input type="checkbox" checked={drink.active} onChange={(event) => onChange({ ...drink, active: event.target.checked })} /> Im Rechner anzeigen
      </label>
      <div className="mt-3 space-y-2">
        {drink.variants.map((variant) => {
          const parsed = parsePrice(variant.price);
          return (
            <div key={variant.id} className="variant-row">
              <input value={variant.label} onChange={(event) => updateVariant(variant.id, { label: event.target.value })} placeholder="Grösse" aria-label="Grösse" className="field-input" />
              <div className="price-input">
                <input value={variant.price} inputMode="decimal" onChange={(event) => updateVariant(variant.id, { price: event.target.value })} aria-label="Preis in Franken" />
                <span>CHF</span>
              </div>
              <button onClick={() => onChange({ ...drink, variants: drink.variants.filter((item) => item.id !== variant.id) })} className="icon-button danger" aria-label="Variante löschen">×</button>
              <span className="hidden text-xs text-slate-400 lg:block">{Number.isNaN(parsed) ? "" : formatPrice(parsed)}</span>
            </div>
          );
        })}
      </div>
      <button onClick={() => onChange({ ...drink, variants: [...drink.variants, { id: newId("variant"), label: "", price: "" }] })} className="text-button mt-2">＋ Variante</button>
    </div>
  );
}
