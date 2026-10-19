// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import BarCardImporter from "./BarCardImporter";

describe("bar-card importer", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  beforeEach(() => {
    Object.values(actions).forEach((mock) => mock.mockReset());
    actions.prepare.mockResolvedValue({ ok: true, importId: "import-1", uploadUrl: "https://storage.test/upload/sign/bar-imports/owner/bar/import.pdf?token=t" });
    actions.upload.mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", actions.upload);
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
    expect(actions.upload).toHaveBeenCalledWith(
      "https://storage.test/upload/sign/bar-imports/owner/bar/import.pdf?token=t",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("cancels the prepared import when the storage upload fails", async () => {
    actions.upload.mockResolvedValue(new Response(null, { status: 400 }));
    const { container } = render(<BarCardImporter barId="bar-1" onApply={() => true} />);
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(fileInput, { target: { files: [new File(["%PDF-1.7"], "karte.pdf", { type: "application/pdf" })] } });

    await waitFor(() => expect(actions.cancel).toHaveBeenCalledWith("bar-1", "import-1"));
    expect(screen.getByRole("alert").textContent).toContain("nicht hochgeladen");
    expect(actions.process).not.toHaveBeenCalled();
  });

  it("rejects unsupported files before preparing an upload", () => {
    const { container } = render(<BarCardImporter barId="bar-1" onApply={() => true} />);
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(fileInput, { target: { files: [new File(["text"], "karte.txt", { type: "text/plain" })] } });
    expect(screen.getByRole("alert").textContent).toContain("Erlaubt sind");
    expect(actions.prepare).not.toHaveBeenCalled();
  });
});
