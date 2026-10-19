// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BarCardImporter from "~/components/BarCardImporter";

const proposal = {
  categories: [{ id: "cat-1", name: "Softdrinks", emoji: "🥤", items: [{ id: "drink-1", name: "Cola", note: "", variants: [{ id: "variant-1", label: "Standard", price: 500 }, { id: "variant-2", label: "5 dl", price: null }] }] }],
  warnings: [{ path: "categories.0.items.0", message: "Preiszuordnung bitte prüfen." }],
};
const pdf = () => new File(["%PDF-1.7"], "karte.pdf", { type: "application/pdf" });

describe("bar-card importer", () => {
  afterEach(cleanup);

  it("previews warnings, requires acknowledgement, and applies the selected mode", async () => {
    const importFile = vi.fn(async () => ({ ok: true as const, proposal }));
    const onApply = vi.fn(() => true);
    render(<BarCardImporter enabled importFile={importFile} onApply={onApply} />);
    fireEvent.change(screen.getByLabelText("Barkarte hochladen"), { target: { files: [pdf()] } });
    await screen.findByText("Erkannter Vorschlag");
    expect(screen.getByText("1 Kategorien · 1 Getränke")).toBeInTheDocument();
    expect(screen.getByText("Standard: 5.– · 5 dl: Preis fehlt")).toBeInTheDocument();
    const apply = screen.getByRole("button", { name: "Vorschlag übernehmen" });
    expect(apply).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Ich habe die unsicheren Zuordnungen geprüft."));
    fireEvent.click(screen.getByLabelText("An bestehende Kategorien anhängen"));
    fireEvent.click(apply);
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(proposal, "append"));
    expect(screen.queryByText("Erkannter Vorschlag")).toBeNull();
  });

  it("shows server errors", async () => {
    render(<BarCardImporter enabled importFile={async () => ({ ok: false, error: "Mistral ist momentan ausgelastet." })} onApply={() => true} />);
    fireEvent.change(screen.getByLabelText("Barkarte hochladen"), { target: { files: [pdf()] } });
    expect((await screen.findByRole("alert")).textContent).toContain("ausgelastet");
  });

  it("rejects unsupported and oversized files before uploading", () => {
    const importFile = vi.fn();
    render(<BarCardImporter enabled importFile={importFile} onApply={() => true} />);
    fireEvent.change(screen.getByLabelText("Barkarte hochladen"), { target: { files: [new File(["text"], "karte.txt", { type: "text/plain" })] } });
    expect(screen.getByRole("alert").textContent).toContain("Erlaubt sind");
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "gross.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Barkarte hochladen"), { target: { files: [big] } });
    expect(screen.getByRole("alert").textContent).toContain("10 MB");
    expect(importFile).not.toHaveBeenCalled();
  });

  it("explains when the import is not configured", () => {
    render(<BarCardImporter enabled={false} importFile={vi.fn()} onApply={() => true} />);
    expect(screen.getByText("Der Import ist auf dieser Installation nicht eingerichtet.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Barkarte hochladen")).toBeNull();
  });
});
