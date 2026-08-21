"use client";

import { useActionState, useEffect, useState } from "react";
import { createBarAction } from "@/app/dashboard/actions";
import { configuredRootDomain } from "@/lib/urls";

export default function NewBarForm() {
  const rootDomain = configuredRootDomain();
  const [state, formAction, pending] = useActionState(createBarAction, null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [editedSlug, setEditedSlug] = useState(false);
  const [availability, setAvailability] = useState<string>("");

  useEffect(() => {
    if (slug.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/slug-availability?slug=${encodeURIComponent(slug)}`, { signal: controller.signal });
        const result = await response.json();
        setAvailability(result.available ? "Adresse ist verfügbar ✓" : result.error ?? "Adresse ist bereits vergeben");
      } catch { /* A later keystroke starts the next check. */ }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [slug]);

  return (
    <form action={formAction} className="editor-panel mt-8 space-y-7">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="field-label">Name der Bar<input name="name" value={name} onChange={(event) => { const value = event.target.value; setName(value); if (!editedSlug) { setSlug(value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32)); setAvailability(""); } }} required maxLength={80} className="field-input" placeholder="Festzelt Sonnenrain" /></label>
        <label className="field-label">Webadresse<input name="slug" value={slug} onChange={(event) => { setEditedSlug(true); setSlug(event.target.value.toLowerCase()); setAvailability(""); }} required minLength={3} maxLength={32} className="field-input font-mono" placeholder="sonnenrain" /><span className={`field-hint ${availability.includes("✓") ? "text-emerald-700" : ""}`}>{availability || `${slug || "deine-bar"}.${rootDomain}`}</span></label>
      </div>
      <div><span className="field-label">Farben</span><div className="mt-2 grid gap-4 sm:grid-cols-2"><label className="color-field"><input type="color" name="background" defaultValue="#101a17" /><span><strong>Grundfarbe</strong><small>Hintergrund und Flächen</small></span></label><label className="color-field"><input type="color" name="accent" defaultValue="#f3ba45" /><span><strong>Akzentfarbe</strong><small>Preise und aktive Elemente</small></span></label></div></div>
      <div className="sample-note"><strong>Startklar mit Beispielkarte</strong><p>Wir legen Bier, Wein und alkoholfreie Getränke an. Alles lässt sich vor der Veröffentlichung ändern.</p></div>
      {state?.error && <p className="form-message error" role="alert">{state.error}</p>}
      <div className="flex gap-3"><button disabled={pending} className="primary-button">{pending ? "Wird erstellt…" : "Bar erstellen"}</button><a href="/dashboard" className="secondary-button">Abbrechen</a></div>
    </form>
  );
}
