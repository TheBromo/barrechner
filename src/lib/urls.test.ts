import { describe, expect, it } from "vitest";
import { configuredRootDomain } from "./urls";

describe("root domain configuration", () => {
  it("uses the production default for missing or invalid values", () => {
    expect(configuredRootDomain()).toBe("barrechner.ch");
    expect(configuredRootDomain("")).toBe("barrechner.ch");
    expect(configuredRootDomain("://invalid")).toBe("barrechner.ch");
  });

  it("accepts a hostname or a complete URL without duplicating the protocol", () => {
    expect(configuredRootDomain("barrechner.ch")).toBe("barrechner.ch");
    expect(configuredRootDomain("https://barrechner.ch/")).toBe("barrechner.ch");
    expect(configuredRootDomain(" HTTP://BARRECHNER.CH/path ")).toBe("barrechner.ch");
  });
});
