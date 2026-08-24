import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminFrom: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn().mockResolvedValue({ id: "user-1" }) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));
vi.mock("@/lib/mistral-import", () => ({ importBarCard: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        single: vi.fn().mockResolvedValue({ data: { id: "bar-1" }, error: null }),
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: mocks.adminFrom,
    storage: { from: vi.fn() },
  }),
}));

import { prepareBarImportAction } from "./actions";

describe("bar import action errors", () => {
  beforeEach(() => {
    mocks.adminFrom.mockReset();
    mocks.logError.mockReset();
  });

  it("returns the message from a plain Supabase error object", async () => {
    mocks.adminFrom.mockReturnValue({
      insert: vi.fn().mockResolvedValue({
        error: { message: "relation public.bar_import_uploads does not exist", code: "42P01" },
      }),
    });

    const result = await prepareBarImportAction("bar-1", {
      name: "karte.pdf",
      size: 100,
      type: "application/pdf",
    });

    expect(result).toEqual({
      ok: false,
      error: "Der Barkarten-Import ist in Supabase noch nicht eingerichtet. Bitte führe die aktuelle Migration aus.",
    });
  });

  it("preserves useful messages from other plain error objects", async () => {
    mocks.adminFrom.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: { message: "Speicher vorübergehend nicht erreichbar", code: "503" } }),
    });

    const result = await prepareBarImportAction("bar-1", {
      name: "karte.pdf",
      size: 100,
      type: "application/pdf",
    });

    expect(result).toEqual({ ok: false, error: "Speicher vorübergehend nicht erreichbar" });
  });

  it("turns PostgREST schema-cache errors into a migration instruction", async () => {
    mocks.adminFrom.mockReturnValue({
      insert: vi.fn().mockResolvedValue({
        error: {
          message: "Could not find the table 'public.bar_import_uploads' in the schema cache",
          code: "PGRST205",
        },
      }),
    });

    const result = await prepareBarImportAction("bar-1", {
      name: "karte.pdf",
      size: 100,
      type: "application/pdf",
    });

    expect(result).toEqual({
      ok: false,
      error: "Der Barkarten-Import ist in Supabase noch nicht eingerichtet. Bitte führe die aktuelle Migration aus.",
    });
  });
});
