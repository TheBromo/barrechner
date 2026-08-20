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

export function foregroundFor(hex: string): "#0b0d0c" | "#ffffff" {
  return luminance(hex) > 0.46 ? "#0b0d0c" : "#ffffff";
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

export function themeVariables(background: string, accent: string): Record<string, string> {
  const lightBackground = luminance(background) > 0.45;
  return {
    "--bar-bg": background,
    "--bar-surface": mix(background, lightBackground ? "#000000" : "#ffffff", 0.08),
    "--bar-surface-strong": mix(background, lightBackground ? "#000000" : "#ffffff", 0.16),
    "--bar-text": foregroundFor(background),
    "--bar-accent": accent,
    "--bar-accent-text": foregroundFor(accent),
  };
}
