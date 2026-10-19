import { useEffect, useState, type FormEvent } from "react";
import { Link, useHydrated, useRouter } from "@tanstack/react-router";
import { createBar } from "~/functions/bars";
import { DEFAULT_THEME } from "~/lib/seed";
import { normalizeSlug } from "~/lib/slug";
import { tenantAddress, type Origins } from "~/lib/urls";

export default function NewBarForm({ origins }: { origins: Origins }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [editedSlug, setEditedSlug] = useState(false);
  const [availability, setAvailability] = useState<{ available: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (slug.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/slug-availability?slug=${encodeURIComponent(slug)}`, { signal: controller.signal });
        const result = (await response.json()) as { available: boolean; error?: string };
        setAvailability({ available: result.available, text: result.available ? "Adresse ist verfügbar ✓" : result.error ?? "Adresse ist bereits vergeben" });
      } catch {
        // A later keystroke starts the next check.
      }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [slug]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    const result = await createBar({ data: Object.fromEntries(form) }).catch(() => ({ ok: false as const, error: "Die Bar konnte nicht erstellt werden." }));
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    await router.navigate({ to: "/dashboard/bars/$barId", params: { barId: result.barId } });
  }

  return (
    <form method="post" onSubmit={onSubmit} className="editor-panel mt-8 space-y-7">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="field-label">Name der Bar
          <input
            name="name" value={name} required maxLength={80} className="field-input" placeholder="Festzelt Sonnenrain"
            onChange={(event) => {
              setName(event.target.value);
              if (!editedSlug) { setSlug(normalizeSlug(event.target.value)); setAvailability(null); }
            }}
          />
        </label>
        <label className="field-label">Webadresse
          <input
            name="slug" value={slug} required minLength={3} maxLength={32} className="field-input font-mono" placeholder="sonnenrain"
            onChange={(event) => { setEditedSlug(true); setSlug(event.target.value.toLowerCase()); setAvailability(null); }}
          />
          <span className={`field-hint ${availability?.available ? "text-emerald-700" : ""}`}>{availability?.text ?? tenantAddress(origins, slug || "deine-bar")}</span>
        </label>
      </div>
      <div>
        <span className="field-label">Farben</span>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <label className="color-field"><input type="color" name="background" defaultValue={DEFAULT_THEME.background} /><span><strong>Grundfarbe</strong><small>Hintergrund und Flächen</small></span></label>
          <label className="color-field"><input type="color" name="accent" defaultValue={DEFAULT_THEME.accent} /><span><strong>Akzentfarbe</strong><small>Preise und aktive Elemente</small></span></label>
        </div>
      </div>
      <div className="sample-note"><strong>Startklar mit Beispielkarte</strong><p>Wir legen Bier, Wein und alkoholfreie Getränke an. Alles lässt sich vor der Veröffentlichung ändern.</p></div>
      {error && <p className="form-message error" role="alert">{error}</p>}
      <div className="flex gap-3">
        <button disabled={pending || !hydrated} className="primary-button">{pending ? "Wird erstellt…" : "Bar erstellen"}</button>
        <Link to="/dashboard" className="secondary-button">Abbrechen</Link>
      </div>
    </form>
  );
}
