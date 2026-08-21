import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Calculator from "./Calculator";
import { starterConfig } from "@/lib/seed";

describe("calculator icons", () => {
  it("renders configured emoji and legacy fallbacks", () => {
    const menu = starterConfig("Mondbar");
    menu.logoEmoji = "🌙";
    menu.categories[0].emoji = "🫗";
    menu.categories[1].emoji = "";

    const html = renderToStaticMarkup(<Calculator menu={menu} slug="mondbar" preview />);
    expect(html).toContain("🌙");
    expect(html).toContain("🫗");
    expect(html).toContain("🍹");
  });

  it("renders pictures before emoji when displaying malformed legacy data", () => {
    const menu = starterConfig();
    menu.logoUrl = "https://example.com/logo.webp";
    menu.logoEmoji = "🌙";
    menu.categories[0].image = "https://example.com/beer.webp";
    menu.categories[0].emoji = "🫗";

    const html = renderToStaticMarkup(<Calculator menu={menu} slug="bilderbar" preview />);
    expect(html).toContain("https://example.com/logo.webp");
    expect(html).toContain("https://example.com/beer.webp");
    expect(html).not.toContain("🌙");
    expect(html).not.toContain("🫗");
  });
});
