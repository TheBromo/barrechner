// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  prepare: vi.fn(),
  process: vi.fn(),
  cancel: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("@/app/dashboard/actions", () => ({
  prepareBarImportAction: actions.prepare,
  processBarImportAction: actions.process,
  cancelBarImportAction: actions.cancel,
}));
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: actions.upload }) } }),
}));

import BarCardImporter from "./BarCardImporter";

describe("bar-card importer", () => {
  beforeEach(() => {
    Object.values(actions).forEach((mock) => mock.mockReset());
    actions.prepare.mockResolvedValue({ ok: true, importId: "import-1", path: "owner/bar/import.pdf", token: "token" });
    actions.upload.mockResolvedValue({ error: null });
    actions.process.mockResolvedValue({
      ok: true,
      proposal: {
        categories: [{ id: "cat-1", name: "Softdrinks", emoji: "🥤", items: [{ id: "drink-1", name: "Cola", note: "", variants: [{ id: "variant-1", label: "Standard", price: 500 }] }] }],
        warnings: [{ path: "categories.0.items.0", message: "Preiszuordnung bitte prüfen." }],
      },
    });
  });

  it("uploads, previews warnings, requires acknowledgement, and applies the selected mode", async () => {
    const onApply = vi.fn(() => true);
    const { container } = render(<BarCardImporter barId="bar-1" onApply={onApply} />);
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(fileInput, { target: { files: [new File(["%PDF-1.7"], "karte.pdf", { type: "application/pdf" })] } });

    await screen.findByText("Erkannter Vorschlag");
    expect(screen.getByText("1 Kategorien · 1 Getränke")).toBeTruthy();
    const apply = screen.getByRole("button", { name: "Vorschlag übernehmen" });
    expect((apply as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByLabelText("Ich habe die unsicheren Zuordnungen geprüft."));
    fireEvent.click(screen.getByLabelText("An bestehende Kategorien anhängen"));
    fireEvent.click(apply);

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ warnings: expect.any(Array) }), "append"));
  });

  it("rejects unsupported files before preparing an upload", () => {
    const { container } = render(<BarCardImporter barId="bar-1" onApply={() => true} />);
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(fileInput, { target: { files: [new File(["text"], "karte.txt", { type: "text/plain" })] } });
    expect(screen.getByRole("alert").textContent).toContain("Erlaubt sind");
    expect(actions.prepare).not.toHaveBeenCalled();
  });
});
