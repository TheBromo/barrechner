import type { BarConfig } from "./types";

export function starterConfig(displayName = "Meine Bar"): BarConfig {
  return {
    schemaVersion: 1,
    revision: 0,
    updatedAt: new Date().toISOString(),
    displayName,
    logoUrl: "",
    logoEmoji: "",
    theme: { background: "#101a17", accent: "#f3ba45" },
    categories: [
      {
        id: "bier",
        name: "Bier",
        image: "",
        emoji: "🍺",
        drinks: [
          { id: "lager", name: "Lager", active: true, variants: [{ id: "3dl", label: "3 dl", price: 500 }] },
          { id: "panache", name: "Panaché", active: true, variants: [{ id: "3dl", label: "3 dl", price: 500 }] },
        ],
      },
      {
        id: "wein",
        name: "Wein",
        image: "",
        emoji: "🍷",
        drinks: [
          {
            id: "weisswein",
            name: "Weisswein",
            active: true,
            variants: [
              { id: "1dl", label: "1 dl", price: 600 },
              { id: "75cl", label: "75 cl", price: 3600 },
            ],
          },
        ],
      },
      {
        id: "alkoholfrei",
        name: "Alkoholfrei",
        image: "",
        emoji: "🥤",
        drinks: [
          { id: "wasser", name: "Mineralwasser", active: true, variants: [{ id: "3dl", label: "3 dl", price: 300 }] },
          { id: "softdrink", name: "Softdrink", active: true, variants: [{ id: "3dl", label: "3 dl", price: 400 }] },
        ],
      },
    ],
  };
}

export const seedMenu = starterConfig;
