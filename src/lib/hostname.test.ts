import { describe, expect, it } from "vitest";
import { resolveHost } from "./hostname";

describe("tenant hostname resolution", () => {
  it("keeps the apex on the platform", () => expect(resolveHost("barrechner.ch", "barrechner.ch")).toEqual({ kind: "platform" }));
  it("extracts production and local tenants", () => {
    expect(resolveHost("sommer.barrechner.ch", "barrechner.ch")).toEqual({ kind: "tenant", slug: "sommer" });
    expect(resolveHost("sommer.localhost:3000", "barrechner.ch")).toEqual({ kind: "tenant", slug: "sommer" });
  });
  it("does not treat preview deployments as tenants", () => expect(resolveHost("barrechner-git-main.vercel.app", "barrechner.ch")).toEqual({ kind: "platform" }));
});
