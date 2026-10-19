function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const value = hex.replace("#", "");
  return 0.2126 * channel(parseInt(value.slice(0, 2), 16)) +
    0.7152 * channel(parseInt(value.slice(2, 4), 16)) +
    0.0722 * channel(parseInt(value.slice(4, 6), 16));
}

export function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

export function foregroundFor(hex: string): "#000000" | "#ffffff" {
  return contrastRatio(hex, "#000000") >= contrastRatio(hex, "#ffffff") ? "#000000" : "#ffffff";
}

export function mix(hex: string, target: "#000000" | "#ffffff", amount: number): string {
  const source = hex.replace("#", "");
  const destination = target.replace("#", "");
  const channels = [0, 2, 4].map((index) => {
    const from = parseInt(source.slice(index, index + 2), 16);
    const to = parseInt(destination.slice(index, index + 2), 16);
    return Math.round(from + (to - from) * amount).toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

function minimumContrast(color: string, backgrounds: string[]): number {
  return Math.min(...backgrounds.map((background) => contrastRatio(color, background)));
}

/** Preserve a requested color when possible, otherwise move it minimally toward readable dark or light ink. */
export function readableColor(color: string, backgrounds: string[], minimum = 4.5): string {
  if (minimumContrast(color, backgrounds) >= minimum) return color.toLowerCase();
  const bestTarget = minimumContrast("#ffffff", backgrounds) > minimumContrast("#000000", backgrounds) ? "#ffffff" : "#000000";
  if (minimumContrast(bestTarget, backgrounds) < minimum) return bestTarget;
  let low = 0;
  let high = 1;
  for (let index = 0; index < 24; index += 1) {
    const midpoint = (low + high) / 2;
    if (minimumContrast(mix(color, bestTarget, midpoint), backgrounds) >= minimum) high = midpoint;
    else low = midpoint;
  }
  return mix(color, bestTarget, high);
}

export function themeVariables(background: string, accent: string): Record<string, string> {
  const lightBackground = luminance(background) > 0.45;
  const surface = mix(background, lightBackground ? "#000000" : "#ffffff", 0.08);
  const strongSurface = mix(background, lightBackground ? "#000000" : "#ffffff", 0.16);
  const surfaces = [background, surface, strongSurface];
  const text = foregroundFor(background);
  const mutedCandidate = mix(text, lightBackground ? "#ffffff" : "#000000", 0.35);
  const borderCandidate = mix(text, lightBackground ? "#ffffff" : "#000000", 0.55);
  return {
    "--bar-bg": background,
    "--bar-surface": surface,
    "--bar-surface-strong": strongSurface,
    "--bar-text": text,
    "--bar-muted": readableColor(mutedCandidate, surfaces),
    "--bar-border": readableColor(borderCandidate, surfaces, 3),
    "--bar-accent": accent,
    "--bar-accent-text": foregroundFor(accent),
    "--bar-accent-ink": readableColor(accent, surfaces),
    "--bar-danger": readableColor("#ef4444", surfaces),
  };
}
