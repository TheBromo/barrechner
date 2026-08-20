export type HostContext = { kind: "platform" } | { kind: "tenant"; slug: string };

export function hostnameWithoutPort(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

export function resolveHost(hostHeader: string, rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "barrechner.ch"): HostContext {
  const host = hostnameWithoutPort(hostHeader);
  const root = hostnameWithoutPort(rootDomain);
  if (!host || host === root || host === `www.${root}` || host.endsWith(".vercel.app")) {
    return { kind: "platform" };
  }
  if (host === "localhost" || host === "127.0.0.1") return { kind: "platform" };
  if (host.endsWith(".localhost")) {
    const slug = host.slice(0, -".localhost".length).split(".").at(-1);
    return slug ? { kind: "tenant", slug } : { kind: "platform" };
  }
  if (host.endsWith(`.${root}`)) {
    const slug = host.slice(0, -(root.length + 1)).split(".").at(-1);
    return slug && slug !== "www" ? { kind: "tenant", slug } : { kind: "platform" };
  }
  return { kind: "platform" };
}
