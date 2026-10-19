import { describe, expect, it } from "vitest";
import { resolveHost } from "~/lib/hostname";
import { originsFor, tenantAddress, tenantUrl } from "~/lib/urls";
import { assertHostedImages, unreferencedAssets } from "~/lib/assets";
import { emailVerificationRequiredBy, emailVerificationState } from "~/lib/email-verification";

describe("tenant hostname resolution", () => {
  it("keeps the apex and www on the platform", () => {
    expect(resolveHost("barrechner.ch", "barrechner.ch")).toEqual({ kind: "platform" });
    expect(resolveHost("www.barrechner.ch", "barrechner.ch")).toEqual({ kind: "platform" });
  });
  it("extracts production and local tenants", () => {
    expect(resolveHost("sommer.barrechner.ch", "barrechner.ch")).toEqual({ kind: "tenant", slug: "sommer" });
    expect(resolveHost("a.sommer.barrechner.ch.", "barrechner.ch")).toEqual({ kind: "tenant", slug: "sommer" });
    expect(resolveHost("sommer.localhost:1337", "")).toEqual({ kind: "tenant", slug: "sommer" });
  });
  it("does not treat preview deployments or foreign hosts as tenants", () => {
    expect(resolveHost("barrechner-pr-4.team.workers.dev", "")).toEqual({ kind: "platform" });
    expect(resolveHost("sommer.example.com", "barrechner.ch")).toEqual({ kind: "platform" });
  });
});

describe("origins", () => {
  it("uses the root domain in production", () => {
    const origins = originsFor("https://sommer.barrechner.ch/", "barrechner.ch");
    expect(origins.platform).toBe("https://barrechner.ch");
    expect(tenantUrl(origins, "sommer")).toBe("https://sommer.barrechner.ch");
    expect(tenantAddress(origins, "sommer")).toBe("sommer.barrechner.ch");
  });
  it("uses localhost subdomains in development and query strings on previews", () => {
    expect(tenantUrl(originsFor("http://localhost:1337/dashboard", ""), "sommer")).toBe("http://sommer.localhost:1337");
    const preview = originsFor("https://app.team.workers.dev/dashboard", "");
    expect(tenantUrl(preview, "sommer")).toBe("https://app.team.workers.dev/?bar=sommer");
    expect(tenantAddress(preview, "sommer")).toBe("app.team.workers.dev/?bar=sommer");
  });
});

const folder = "user-1/bar-1/";
describe("hosted bar images", () => {
  it("accepts images uploaded for the same bar", () => {
    expect(() => assertHostedImages({ logoUrl: `/img/${folder}logo.webp`, categories: [] }, folder)).not.toThrow();
    expect(() => assertHostedImages({ logoUrl: "", categories: [] }, folder)).not.toThrow();
  });
  it.each(["https://tracker.example/pixel.png", "//tracker.example/pixel.png", "/img/user-2/bar-9/logo.webp", `/img/${folder}../../user-2/x.webp`, `/img/${folder}x.webp?v=1`])("rejects %s", (url) => {
    expect(() => assertHostedImages({ logoUrl: url, categories: [] }, folder)).toThrow("hochgeladen");
  });
  it("keeps images used by a draft or published revision of the same bar", () => {
    const assets = [
      { id: "a", bar_id: "bar-1", storage_key: "p/a", public_url: "/img/a" },
      { id: "b", bar_id: "bar-1", storage_key: "p/b", public_url: "/img/b" },
      { id: "c", bar_id: "bar-1", storage_key: "p/c", public_url: "/img/c" },
      { id: "d", bar_id: "bar-2", storage_key: "p/d", public_url: "/img/a" },
    ];
    const configs = [
      { bar_id: "bar-1", config: { logoUrl: "/img/a", categories: [] } },
      { bar_id: "bar-1", config: { logoUrl: "", categories: [{ image: "/img/b" }] } },
      { bar_id: "bar-3", config: null },
    ];
    expect(unreferencedAssets(assets, configs).map((asset) => asset.id)).toEqual(["c", "d"]);
  });
});

describe("email verification grace period", () => {
  const createdAt = Date.parse("2026-08-01T12:00:00.000Z");
  const deadline = emailVerificationRequiredBy(createdAt);
  it("ends exactly 30 days after signup", () => expect(new Date(deadline).toISOString()).toBe("2026-08-31T12:00:00.000Z"));
  it("allows an unverified new account before its deadline and requires it afterwards", () => {
    expect(emailVerificationState({ emailVerifiedAt: null, verificationRequiredBy: deadline }, deadline - 1).status).toBe("grace");
    expect(emailVerificationState({ emailVerifiedAt: null, verificationRequiredBy: deadline }, deadline).status).toBe("required");
  });
  it("allows a verified or grandfathered account", () => {
    expect(emailVerificationState({ emailVerifiedAt: null, verificationRequiredBy: null }).status).toBe("verified");
    expect(emailVerificationState({ emailVerifiedAt: createdAt, verificationRequiredBy: deadline }, deadline + 1).status).toBe("verified");
  });
});
