export type HostContext = { kind: "platform" } | { kind: "tenant"; slug: string };

export function hostnameWithoutPort(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

/**
 * Decide whether a request host is the platform or a bar's calculator.
 * `rootDomain` is empty on preview and development deployments, where only `{slug}.localhost` is a tenant.
 */
export function resolveHost(hostHeader: string, rootDomain: string): HostContext {
  const host = hostnameWithoutPort(hostHeader);
  const root = rootDomain.trim().toLowerCase();
  if (!host || host === "localhost" || host === "127.0.0.1" || host.endsWith(".workers.dev")) return { kind: "platform" };
  if (host.endsWith(".localhost")) {
    const slug = host.slice(0, -".localhost".length).split(".").at(-1);
    return slug ? { kind: "tenant", slug } : { kind: "platform" };
  }
  if (root && host.endsWith(`.${root}`)) {
    const slug = host.slice(0, -(root.length + 1)).split(".").at(-1);
    return slug && slug !== "www" ? { kind: "tenant", slug } : { kind: "platform" };
  }
  return { kind: "platform" };
}
