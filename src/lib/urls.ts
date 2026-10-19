import { hostnameWithoutPort } from "./hostname";

/** Where the platform and the calculators live, derived once per request on the server. */
export type Origins = {
  /** e.g. "https://barrechner.ch" */
  platform: string;
  /** Root domain shown in addresses, e.g. "barrechner.ch" or "localhost:1337". */
  displayDomain: string;
  /** Template for a bar's calculator; "{slug}" is replaced. */
  tenantTemplate: string;
};

export function originsFor(requestUrl: string, rootDomain: string): Origins {
  const url = new URL(requestUrl);
  if (rootDomain) {
    return { platform: `https://${rootDomain}`, displayDomain: rootDomain, tenantTemplate: `https://{slug}.${rootDomain}` };
  }
  const host = hostnameWithoutPort(url.host);
  if (host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1") {
    const port = url.port ? `:${url.port}` : "";
    return { platform: `${url.protocol}//localhost${port}`, displayDomain: `localhost${port}`, tenantTemplate: `${url.protocol}//{slug}.localhost${port}` };
  }
  // Preview deployments have no wildcard subdomains; calculators are opened with ?bar={slug}.
  return { platform: url.origin, displayDomain: url.host, tenantTemplate: `${url.origin}/?bar={slug}` };
}

export function tenantUrl(origins: Origins, slug: string): string {
  return origins.tenantTemplate.replace("{slug}", slug);
}

export function tenantAddress(origins: Origins, slug: string): string {
  return origins.tenantTemplate.includes("?bar=") ? `${origins.displayDomain}/?bar=${slug}` : `${slug}.${origins.displayDomain}`;
}
