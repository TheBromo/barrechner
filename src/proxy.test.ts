import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/proxy", () => ({ refreshAuthSession: vi.fn(async (_request: unknown, response: Response) => response) }));

import { proxy } from "./proxy";

function request(host: string, path: string) {
  return new NextRequest(`https://${host}${path}`, { headers: { host } });
}

describe("host routing", () => {
  it("rewrites a tenant root to its calculator", async () => {
    const response = await proxy(request("sonnenrain.barrechner.ch", "/"));
    expect(response.headers.get("x-middleware-rewrite")).toBe("https://sonnenrain.barrechner.ch/b/sonnenrain");
  });

  it("serves the manifest but nothing else of the platform on tenant hosts", async () => {
    expect((await proxy(request("sonnenrain.barrechner.ch", "/manifest.webmanifest"))).status).toBe(200);
    for (const path of ["/dashboard", "/anmelden", "/b/other", "/api/slug-availability"]) {
      expect((await proxy(request("sonnenrain.barrechner.ch", path))).status).toBe(404);
    }
  });

  it("does not render calculators on the platform host", async () => {
    expect((await proxy(request("barrechner.ch", "/b/sonnenrain"))).status).toBe(404);
    expect((await proxy(request("barrechner-git-main.vercel.app", "/b/sonnenrain"))).status).toBe(404);
    expect((await proxy(request("barrechner.ch", "/dashboard"))).status).toBe(200);
  });

  it("redirects www to the root domain", async () => {
    const response = await proxy(request("www.barrechner.ch", "/anmelden?next=/dashboard"));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://barrechner.ch/anmelden?next=/dashboard");
  });
});
