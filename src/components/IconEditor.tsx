import { useRef, useState } from "react";
import { uploadBarImage } from "~/functions/bars";
import type { AssetKind } from "~/lib/assets";
import { userMessage } from "~/lib/errors";
import { prepareImage } from "~/lib/resize-image";
import { isSingleEmoji } from "~/lib/types";

export type IconValue = { image: string; emoji: string };

const LOGO_EMOJIS = ["🍺", "🍻", "🍷", "🍹", "🥂", "🎉", "🎪", "🎸", "⭐", "❤️", "🔥", "🏔️"];
const CATEGORY_EMOJIS = ["🍺", "🍷", "🥂", "🍹", "🥤", "☕", "🍵", "🧃", "💧", "🥨", "🍕", "🍔"];

export type UploadImage = (file: File, kind: AssetKind) => Promise<{ url: string } | { error: string }>;

/** Default uploader: downsize in the browser, then store through the server function. */
export function barImageUploader(barId: string): UploadImage {
  return async (file, kind) => {
    try {
      const blob = await prepareImage(file, kind);
      const data = new FormData();
      data.set("barId", barId);
      data.set("kind", kind);
      data.set("file", blob, "image");
      const result = await uploadBarImage({ data });
      return result.ok ? { url: result.url } : { error: result.error };
    } catch (error) {
      return { error: userMessage(error, "Das Bild konnte nicht hochgeladen werden. Bitte versuche es erneut.") };
    }
  };
}

type Props = { label: string; value: IconValue; kind: AssetKind; compact?: boolean; upload: UploadImage; onChange: (value: IconValue) => void };

export default function IconEditor({ label, value, kind, compact = false, upload, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [customEmoji, setCustomEmoji] = useState(value.emoji);
  const [error, setError] = useState("");

  function chooseEmoji(emoji: string) {
    setCustomEmoji(emoji);
    setError("");
    onChange({ image: "", emoji });
  }

  function updateCustomEmoji(emoji: string) {
    setCustomEmoji(emoji);
    if (!emoji.trim()) {
      setError("");
      onChange({ image: "", emoji: "" });
    } else if (isSingleEmoji(emoji)) {
      setError("");
      onChange({ image: "", emoji: emoji.trim() });
    } else {
      setError("Bitte genau ein Emoji eingeben.");
    }
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setError("");
    const result = await upload(file, kind);
    setUploading(false);
    if (input.current) input.current.value = "";
    if ("error" in result) { setError(result.error); return; }
    setCustomEmoji("");
    onChange({ image: result.url, emoji: "" });
  }

  const emojis = kind === "logo" ? LOGO_EMOJIS : CATEGORY_EMOJIS;
  return (
    <div className={`icon-editor ${compact ? "compact" : ""}`}>
      <div className="image-preview" aria-label={`${label} Vorschau`}>
        {value.image ? <img src={value.image} alt="" /> : value.emoji ? <span className="icon-preview-emoji">{value.emoji}</span> : <span>{kind === "logo" ? "B" : "◇"}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <strong>{label}</strong>
        <div className="emoji-palette" aria-label={`${label}: Emoji auswählen`}>
          {emojis.map((emoji) => (
            <button key={emoji} type="button" onClick={() => chooseEmoji(emoji)} className={value.emoji === emoji ? "selected" : ""} aria-label={`${emoji} auswählen`} aria-pressed={value.emoji === emoji}>{emoji}</button>
          ))}
        </div>
        <label className="custom-emoji-label">Eigenes Emoji
          <input value={customEmoji} onChange={(event) => updateCustomEmoji(event.target.value)} inputMode="text" maxLength={32} placeholder="🙂" aria-invalid={Boolean(error)} />
        </label>
        {error && <p className="icon-error" role="alert">{error}</p>}
        <p>Oder PNG, JPEG oder WebP hochladen · max. 4 MB</p>
        <button type="button" disabled={uploading} onClick={() => input.current?.click()} className="text-button">{uploading ? "Wird verarbeitet…" : value.image ? "Bild ersetzen" : "Bild hochladen"}</button>
        {(value.image || value.emoji) && (
          <button type="button" onClick={() => { setCustomEmoji(""); setError(""); onChange({ image: "", emoji: "" }); }} className="text-button danger ml-3">Entfernen</button>
        )}
      </div>
      <input ref={input} type="file" hidden aria-label={`${label} hochladen`} accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file); }} />
    </div>
  );
}
