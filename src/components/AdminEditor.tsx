"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BarConfig } from "@/lib/types";
import type { ImportProposal } from "@/lib/bar-import";
import { formatPrice, parsePrice } from "@/lib/format";
import {
  discardDraftAction,
  publishBarAction,
  renameBarAction,
  saveDraftAction,
  uploadAssetAction,
} from "@/app/dashboard/actions";
import { tenantOrigin } from "@/lib/urls";
import { isSingleEmoji } from "@/lib/types";
import BarCardImporter from "./BarCardImporter";

type DraftVariant = { id: string; label: string; price: string };
type DraftDrink = { id: string; name: string; note: string; active: boolean; variants: DraftVariant[] };
type DraftCategory = { id: string; name: string; image: string; emoji: string; drinks: DraftDrink[] };
type IconValue = { image: string; emoji: string };

const LOGO_EMOJIS = ["🍺", "🍻", "🍷", "🍹", "🥂", "🎉", "🎪", "🎸", "⭐", "❤️", "🔥", "🏔️"];
const CATEGORY_EMOJIS = ["🍺", "🍷", "🥂", "🍹", "🥤", "☕", "🍵", "🧃", "💧", "🥨", "🍕", "🍔"];

function id(prefix: string) { return `${prefix}-${crypto.randomUUID().slice(0, 8)}`; }
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
      variants: drink.variants.map((variant) => ({ ...variant, price: (variant.price / 100).toFixed(2).replace(/\.00$/, "") })),
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
      variants: item.variants.map((variant) => ({
        id: variant.id,
        label: variant.label,
        price: variant.price === null ? "" : (variant.price / 100).toFixed(2).replace(/\.00$/, ""),
      })),
    })),
  }));
}

export default function AdminEditor({ menu, barId, slug, publishedRevision }: { menu: BarConfig; barId: string; slug: string; publishedRevision: number | null }) {
  const router = useRouter();
  const [name, setName] = useState(menu.displayName);
  const [logoUrl, setLogoUrl] = useState(menu.logoUrl);
  const [logoEmoji, setLogoEmoji] = useState(menu.logoEmoji ?? "");
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
      logoUrl,
      logoEmoji,
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
    const result = await saveDraftAction(barId, JSON.stringify(buildConfig()));
    if (!result.ok) throw new Error(result.error);
    setDirty(false);
    setCategoriesDirty(false);
    return result;
  }

  function save() {
    startTransition(async () => {
      try { await saveNow(); setMessage({ type: "ok", text: "Entwurf gespeichert." }); router.refresh(); }
      catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "Speichern fehlgeschlagen." }); }
    });
  }

  function publish() {
    if (!window.confirm("Diese Version jetzt für das Barteam veröffentlichen?")) return;
    startTransition(async () => {
      try {
        if (dirty) await saveNow();
        const result = await publishBarAction(barId);
        if (!result.ok) throw new Error(result.error);
        setMessage({ type: "ok", text: "Neue Version ist live." });
        router.refresh();
      } catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "Veröffentlichung fehlgeschlagen." }); }
    });
  }

  function discard() {
    if (!window.confirm("Entwurf verwerfen und die veröffentlichte Version wiederherstellen?")) return;
    startTransition(async () => {
      const result = await discardDraftAction(barId);
      if (!result.ok) { setMessage({ type: "error", text: result.error }); return; }
      setDirty(false); setCategoriesDirty(false); router.refresh();
    });
  }

  function rename() {
    startTransition(async () => {
      const result = await renameBarAction(barId, nextSlug);
      if (!result.ok) { setMessage({ type: "error", text: result.error }); return; }
      setMessage({ type: "ok", text: "Adresse geändert. Die alte Adresse leitet 30 Tage weiter." });
      router.refresh();
    });
  }

  function applyImport(proposal: ImportProposal, mode: "replace" | "append"): boolean {
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
        <div><Link href="/dashboard" className="back-link">← Alle Bars</Link><div className="mt-4 flex items-center gap-3"><p className="status-pill">{publishedRevision ? `Live · Version ${publishedRevision}` : "Noch nicht veröffentlicht"}</p>{dirty && <p className="status-pill draft">Ungespeicherte Änderungen</p>}</div><h1 className="mt-3 text-4xl font-black tracking-[-0.045em] text-slate-950">{name || "Unbenannte Bar"}</h1></div>
        <div className="flex gap-2"><Link href={`/dashboard/bars/${barId}/preview`} target="_blank" className="secondary-button small">Vorschau</Link>{publishedRevision && <a href={tenantOrigin(slug)} target="_blank" rel="noreferrer" className="secondary-button small">Live öffnen</a>}</div>
      </div>

      <section className="editor-panel mt-8">
        <div className="section-heading"><span>01</span><div><h2>Auftritt</h2><p>Name, Logo und Farben des Rechners.</p></div></div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className="field-label self-start">Sichtbarer Barname<input value={name} onChange={(event) => { setName(event.target.value); changed(); }} className="field-input" maxLength={80} /></label>
          <IconEditor label="Logo" value={{ image: logoUrl, emoji: logoEmoji }} barId={barId} kind="logo" onChange={(value) => { setLogoUrl(value.image); setLogoEmoji(value.emoji); changed(); }} />
          <label className="color-field"><input type="color" value={background} onChange={(event) => { setBackground(event.target.value); changed(); }} /><span><strong>Grundfarbe</strong><small>{background}</small></span></label>
          <label className="color-field"><input type="color" value={accent} onChange={(event) => { setAccent(event.target.value); changed(); }} /><span><strong>Akzentfarbe</strong><small>{accent}</small></span></label>
        </div>
      </section>

      <section className="editor-panel mt-5">
        <div className="section-heading"><span>02</span><div><h2>Webadresse</h2><p>Beim Umbenennen leitet die bisherige Adresse 30 Tage weiter.</p></div></div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row"><input value={nextSlug} onChange={(event) => setNextSlug(event.target.value.toLowerCase())} className="field-input font-mono" /><button disabled={pending || nextSlug === slug} onClick={rename} className="secondary-button shrink-0">Adresse ändern</button></div>
      </section>

      <section className="mt-5 space-y-4">
        <div className="section-heading px-1"><span>03</span><div><h2>Getränkekarte</h2><p>Die Reihenfolge wird im Rechner übernommen.</p></div></div>
        <BarCardImporter barId={barId} onApply={applyImport} />
        {categories.map((category, categoryIndex) => (
          <CategoryEditor key={category.id} category={category} barId={barId}
            onChange={(next) => { setCategories((all) => all.map((item) => item.id === category.id ? next : item)); categoriesChanged(); }}
            onMove={(direction) => { setCategories((all) => move(all, categoryIndex, categoryIndex + direction)); categoriesChanged(); }}
            onDelete={() => { if (window.confirm("Kategorie wirklich löschen?")) { setCategories((all) => all.filter((item) => item.id !== category.id)); categoriesChanged(); } }} />
        ))}
        <button onClick={() => { setCategories((all) => [...all, { id: id("cat"), name: "Neue Kategorie", image: "", emoji: "🍹", drinks: [] }]); categoriesChanged(); }} className="add-button">＋ Kategorie hinzufügen</button>
      </section>

      <div className="editor-footer"><div className={`editor-message ${message?.type ?? ""}`}>{message?.text ?? (dirty ? "Änderungen noch nicht gespeichert" : "Entwurf ist gespeichert")}</div>{publishedRevision && <button disabled={pending} onClick={discard} className="text-button">Entwurf verwerfen</button>}<button disabled={pending || !dirty} onClick={save} className="secondary-button">{pending ? "Bitte warten…" : "Entwurf speichern"}</button><button disabled={pending} onClick={publish} className="primary-button">Veröffentlichen</button></div>
    </main>
  );
}

function CategoryEditor({ category, barId, onChange, onMove, onDelete }: { category: DraftCategory; barId: string; onChange: (value: DraftCategory) => void; onMove: (direction: -1 | 1) => void; onDelete: () => void }) {
  return (
    <article className="category-editor">
      <div className="flex flex-wrap items-center gap-2">
        <input value={category.name} onChange={(event) => onChange({ ...category, name: event.target.value })} className="field-input min-w-52 flex-1 text-lg font-bold" />
        <button onClick={() => onMove(-1)} className="icon-button" aria-label="Nach oben">↑</button><button onClick={() => onMove(1)} className="icon-button" aria-label="Nach unten">↓</button><button onClick={onDelete} className="icon-button danger" aria-label="Kategorie löschen">×</button>
      </div>
      <div className="mt-3"><IconEditor label="Kategorie-Icon" value={{ image: category.image, emoji: category.emoji }} barId={barId} kind="category" compact onChange={(value) => onChange({ ...category, image: value.image, emoji: value.emoji })} /></div>
      <div className="mt-4 space-y-3">
        {category.drinks.map((drink, drinkIndex) => <DrinkEditor key={drink.id} drink={drink}
          onChange={(next) => onChange({ ...category, drinks: category.drinks.map((item) => item.id === drink.id ? next : item) })}
          onMove={(direction) => onChange({ ...category, drinks: move(category.drinks, drinkIndex, drinkIndex + direction) })}
          onDelete={() => onChange({ ...category, drinks: category.drinks.filter((item) => item.id !== drink.id) })} />)}
      </div>
      <button onClick={() => onChange({ ...category, drinks: [...category.drinks, { id: id("drink"), name: "", note: "", active: true, variants: [{ id: id("variant"), label: "3 dl", price: "" }] }] })} className="add-button compact">＋ Getränk</button>
    </article>
  );
}

function DrinkEditor({ drink, onChange, onMove, onDelete }: { drink: DraftDrink; onChange: (value: DraftDrink) => void; onMove: (direction: -1 | 1) => void; onDelete: () => void }) {
  return (
    <div className={`drink-editor ${drink.active ? "" : "inactive"}`}>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input value={drink.name} onChange={(event) => onChange({ ...drink, name: event.target.value })} placeholder="Getränkename" className="field-input" />
        <input value={drink.note} onChange={(event) => onChange({ ...drink, note: event.target.value })} placeholder="Optionale Beschreibung" className="field-input" />
        <div className="flex gap-1"><button onClick={() => onMove(-1)} className="icon-button" aria-label="Nach oben">↑</button><button onClick={() => onMove(1)} className="icon-button" aria-label="Nach unten">↓</button><button onClick={onDelete} className="icon-button danger" aria-label="Getränk löschen">×</button></div>
      </div>
      <label className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-600"><input type="checkbox" checked={drink.active} onChange={(event) => onChange({ ...drink, active: event.target.checked })} /> Im Rechner anzeigen</label>
      <div className="mt-3 space-y-2">{drink.variants.map((variant) => <div key={variant.id} className="variant-row"><input value={variant.label} onChange={(event) => onChange({ ...drink, variants: drink.variants.map((item) => item.id === variant.id ? { ...item, label: event.target.value } : item) })} placeholder="Grösse" className="field-input" /><div className="price-input"><input value={variant.price} inputMode="decimal" onChange={(event) => onChange({ ...drink, variants: drink.variants.map((item) => item.id === variant.id ? { ...item, price: event.target.value } : item) })} aria-label="Preis in Franken" /><span>CHF</span></div><button onClick={() => onChange({ ...drink, variants: drink.variants.filter((item) => item.id !== variant.id) })} className="icon-button danger" aria-label="Variante löschen">×</button><span className="hidden text-xs text-slate-400 lg:block">{!Number.isNaN(parsePrice(variant.price)) ? formatPrice(parsePrice(variant.price)) : ""}</span></div>)}</div>
      <button onClick={() => onChange({ ...drink, variants: [...drink.variants, { id: id("variant"), label: "", price: "" }] })} className="text-button mt-2">＋ Variante</button>
    </div>
  );
}

export function IconEditor({ label, value, barId, kind, compact = false, onChange }: { label: string; value: IconValue; barId: string; kind: "logo" | "category"; compact?: boolean; onChange: (value: IconValue) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [customEmoji, setCustomEmoji] = useState(value.emoji);
  const [emojiError, setEmojiError] = useState("");

  function chooseEmoji(emoji: string) {
    setCustomEmoji(emoji);
    setEmojiError("");
    onChange({ image: "", emoji });
  }

  function updateCustomEmoji(emoji: string) {
    setCustomEmoji(emoji);
    if (!emoji.trim()) {
      setEmojiError("");
      onChange({ image: "", emoji: "" });
    } else if (isSingleEmoji(emoji)) {
      setEmojiError("");
      onChange({ image: "", emoji: emoji.trim() });
    } else {
      setEmojiError("Bitte genau ein Emoji eingeben.");
    }
  }

  async function upload(file: File) {
    setUploading(true);
    const data = new FormData(); data.set("file", file);
    const result = await uploadAssetAction(barId, kind, data);
    setUploading(false);
    if ("error" in result) { window.alert(result.error); return; }
    setCustomEmoji("");
    setEmojiError("");
    onChange({ image: result.url, emoji: "" });
  }
  const emojis = kind === "logo" ? LOGO_EMOJIS : CATEGORY_EMOJIS;
  return (
    <div className={`icon-editor ${compact ? "compact" : ""}`}>
      <div className="image-preview" aria-label={`${label} Vorschau`}>
        {value.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- tenant storage host is dynamic.
          <img src={value.image} alt="" />
        ) : value.emoji ? <span className="icon-preview-emoji">{value.emoji}</span> : <span>{kind === "logo" ? "B" : "◇"}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <strong>{label}</strong>
        <div className="emoji-palette" aria-label={`${label}: Emoji auswählen`}>
          {emojis.map((emoji) => <button key={emoji} type="button" onClick={() => chooseEmoji(emoji)} className={value.emoji === emoji ? "selected" : ""} aria-label={`${emoji} auswählen`} aria-pressed={value.emoji === emoji}>{emoji}</button>)}
        </div>
        <label className="custom-emoji-label">Eigenes Emoji<input value={customEmoji} onChange={(event) => updateCustomEmoji(event.target.value)} inputMode="text" maxLength={32} placeholder="🙂" aria-invalid={Boolean(emojiError)} /></label>
        {emojiError && <p className="icon-error">{emojiError}</p>}
        <p>Oder PNG, JPEG oder WebP hochladen · max. 4 MB</p>
        <button type="button" disabled={uploading} onClick={() => input.current?.click()} className="text-button">{uploading ? "Wird verarbeitet…" : value.image ? "Bild ersetzen" : "Bild hochladen"}</button>
        {(value.image || value.emoji) && <button type="button" onClick={() => { setCustomEmoji(""); setEmojiError(""); onChange({ image: "", emoji: "" }); }} className="text-button danger ml-3">Entfernen</button>}
      </div>
      <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
    </div>
  );
}
