import { describe, expect, it } from "vitest";
import { assertHostedImages, unreferencedAssets } from "./assets";

const supabaseUrl = "https://project.supabase.co";
const folder = "user-1/bar-1/";
const hosted = `${supabaseUrl}/storage/v1/object/public/bar-assets/${folder}logo.webp`;

describe("hosted bar images", () => {
  it("accepts images uploaded for the same bar", () => {
    expect(() => assertHostedImages({ logoUrl: hosted, categories: [] }, supabaseUrl, folder)).not.toThrow();
    expect(() => assertHostedImages({ logoUrl: "", categories: [] }, supabaseUrl, folder)).not.toThrow();
  });

  it.each([
    "https://tracker.example/pixel.png",
    "//tracker.example/pixel.png",
    `${supabaseUrl}/storage/v1/object/public/bar-assets/user-2/bar-9/logo.webp`,
    `${supabaseUrl}/storage/v1/object/public/bar-assets/${folder}../../user-2/x.webp`,
  ])("rejects %s", (url) => {
    expect(() => assertHostedImages({ logoUrl: url, categories: [] }, supabaseUrl, folder)).toThrow("hochgeladen");
  });
});

describe("orphaned assets", () => {
  it("keeps images used by a draft or published revision of the same bar", () => {
    const assets = [
      { id: "a", bar_id: "bar-1", storage_path: "p/a", public_url: "https://x/a" },
      { id: "b", bar_id: "bar-1", storage_path: "p/b", public_url: "https://x/b" },
      { id: "c", bar_id: "bar-1", storage_path: "p/c", public_url: "https://x/c" },
      { id: "d", bar_id: "bar-2", storage_path: "p/d", public_url: "https://x/a" },
    ];
    const configs = [
      { bar_id: "bar-1", config: { logoUrl: "https://x/a", categories: [] } },
      { bar_id: "bar-1", config: { logoUrl: "", categories: [{ image: "https://x/b" }] } },
      { bar_id: "bar-3", config: null },
    ];
    expect(unreferencedAssets(assets, configs).map((asset) => asset.id)).toEqual(["c", "d"]);
  });
});
