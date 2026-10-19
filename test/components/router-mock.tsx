import type { ReactNode } from "react";
import { vi } from "vitest";

/** Components only use Link/useHydrated from the router; render them without a router. */
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params, ...rest }: { children: ReactNode; to: string; params?: Record<string, string> }) => {
    const href = Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace(`$${key}`, value), to);
    return <a href={href} {...rest}>{children}</a>;
  },
  useHydrated: () => true,
  useRouter: () => ({ navigate: vi.fn(), invalidate: vi.fn() }),
}));

vi.mock("~/functions/bars", () => ({ uploadBarImage: vi.fn(), createBar: vi.fn() }));
