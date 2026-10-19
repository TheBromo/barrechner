// @vitest-environment jsdom
import "./router-mock";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminEditor, { type EditorActions } from "~/components/AdminEditor";
import IconEditor from "~/components/IconEditor";
import { starterConfig } from "~/lib/seed";
import type { BarConfig } from "~/lib/types";

function setup(overrides: Partial<EditorActions> = {}, publishedRevision: number | null = 1) {
  const actions: EditorActions = {
    save: vi.fn(async () => ({ ok: true as const })),
    publish: vi.fn(async () => ({ ok: true as const, version: 2 })),
    discard: vi.fn(async () => ({ ok: true as const })),
    rename: vi.fn(async (slug: string) => ({ ok: true as const, slug })),
    upload: vi.fn(async () => ({ url: "/img/new.webp" })),
    importFile: vi.fn(),
    refresh: vi.fn(async () => {}),
    ...overrides,
  };
  render(<AdminEditor menu={starterConfig("Sommerbar")} barId="bar-1" slug="sommerbar" publishedRevision={publishedRevision} liveUrl="https://sommerbar.barrechner.ch" importEnabled actions={actions} />);
  return actions;
}

describe("bar editor", () => {
  beforeEach(() => { vi.spyOn(window, "confirm").mockReturnValue(true); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("saves the edited menu with prices in Rappen", async () => {
    const actions = setup();
    expect(screen.getByRole("button", { name: "Entwurf speichern" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Sichtbarer Barname"), { target: { value: "Wintibar" } });
    fireEvent.change(screen.getAllByLabelText("Preis in Franken")[0], { target: { value: "5,50" } });
    fireEvent.click(screen.getAllByLabelText("Im Rechner anzeigen")[1]);
    expect(screen.getByText("Ungespeicherte Änderungen")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Entwurf speichern" }));
    await waitFor(() => expect(actions.save).toHaveBeenCalled());
    const saved = (actions.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as BarConfig;
    expect(saved.displayName).toBe("Wintibar");
    expect(saved.categories[0].drinks[0].variants[0].price).toBe(550);
    expect(saved.categories[0].drinks[1].active).toBe(false);
    expect(await screen.findByText("Entwurf gespeichert.")).toBeInTheDocument();
  });

  it("rejects invalid prices before saving", async () => {
    const actions = setup();
    fireEvent.change(screen.getAllByLabelText("Preis in Franken")[0], { target: { value: "fünf" } });
    fireEvent.click(screen.getByRole("button", { name: "Entwurf speichern" }));
    expect(await screen.findByText("Lager: Preis «fünf» ist ungültig.")).toBeInTheDocument();
    expect(actions.save).not.toHaveBeenCalled();
  });

  it("saves unsaved changes before publishing and shows server errors", async () => {
    const actions = setup({ publish: vi.fn(async () => ({ ok: false as const, error: "Bar nicht gefunden oder archiviert." })) });
    fireEvent.change(screen.getByLabelText("Sichtbarer Barname"), { target: { value: "Neu" } });
    fireEvent.click(screen.getByRole("button", { name: "Veröffentlichen" }));
    expect(await screen.findByText("Bar nicht gefunden oder archiviert.")).toBeInTheDocument();
    expect(actions.save).toHaveBeenCalledBefore(actions.publish as ReturnType<typeof vi.fn>);
  });

  it("adds, reorders and deletes categories and drinks", async () => {
    const actions = setup();
    fireEvent.click(screen.getByRole("button", { name: "＋ Kategorie hinzufügen" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Kategorie nach oben" })[3]);
    fireEvent.click(screen.getAllByRole("button", { name: "Kategorie löschen" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "＋ Getränk" })[0]);
    // Wein now comes first: Weisswein (1 dl, 75 cl), then the new drink.
    fireEvent.change(screen.getAllByLabelText("Getränkename")[1], { target: { value: "Rosé" } });
    fireEvent.change(screen.getAllByLabelText("Preis in Franken")[2], { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Entwurf speichern" }));
    await waitFor(() => expect(actions.save).toHaveBeenCalled());
    const saved = (actions.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as BarConfig;
    // Wein, Neue Kategorie (moved above Alkoholfrei), Alkoholfrei; Bier deleted.
    expect(saved.categories.map((category) => category.name)).toEqual(["Wein", "Neue Kategorie", "Alkoholfrei"]);
    expect(saved.categories[0].drinks.at(-1)).toMatchObject({ name: "Rosé", active: true, variants: [{ label: "3 dl", price: 600 }] });
  });

  it("renames the address and discards drafts only when published", async () => {
    const actions = setup();
    fireEvent.change(screen.getByLabelText("Webadresse"), { target: { value: "Neue-Bar" } });
    fireEvent.click(screen.getByRole("button", { name: "Adresse ändern" }));
    await waitFor(() => expect(actions.rename).toHaveBeenCalledWith("neue-bar"));
    expect(await screen.findByText("Adresse geändert. Die alte Adresse leitet 30 Tage weiter.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Entwurf verwerfen" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Entwurf verwerfen" }));
    await waitFor(() => expect(actions.discard).toHaveBeenCalled());
    cleanup();
    setup({}, null);
    expect(screen.queryByRole("button", { name: "Entwurf verwerfen" })).toBeNull();
    expect(screen.getByText("Noch nicht veröffentlicht")).toBeInTheDocument();
  });

  it("applies an import by replacing or appending categories", async () => {
    const proposal = {
      categories: [{ id: "cat-x", name: "Softdrinks", emoji: "🥤", items: [{ id: "drink-x", name: "Cola", note: "", variants: [{ id: "variant-x", label: "Standard", price: null }] }] }],
      warnings: [],
    };
    const actions = setup({ importFile: vi.fn(async () => ({ ok: true as const, proposal })) });
    const input = screen.getByLabelText("Barkarte hochladen");
    fireEvent.change(input, { target: { files: [new File(["%PDF-1.7"], "karte.pdf", { type: "application/pdf" })] } });
    fireEvent.click(await screen.findByRole("button", { name: "Vorschlag übernehmen" }));
    expect(await screen.findByText("Import übernommen. Bitte prüfen und den Entwurf speichern.")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Bier")).toBeNull();
    expect(screen.getByDisplayValue("Softdrinks")).toBeInTheDocument();
    // The missing price must be filled in before the draft can be saved.
    fireEvent.click(screen.getByRole("button", { name: "Entwurf speichern" }));
    expect(await screen.findByText("Cola: Preis «» ist ungültig.")).toBeInTheDocument();
    expect(actions.save).not.toHaveBeenCalled();
  });
});

describe("icon editor", () => {
  afterEach(cleanup);

  it("switches between curated and custom emoji", () => {
    const onChange = vi.fn();
    render(<IconEditor label="Logo" value={{ image: "/img/logo.webp", emoji: "" }} kind="logo" upload={vi.fn()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "🍺 auswählen" }));
    expect(onChange).toHaveBeenLastCalledWith({ image: "", emoji: "🍺" });
    fireEvent.change(screen.getByLabelText("Eigenes Emoji"), { target: { value: "👨‍👩‍👧‍👦" } });
    expect(onChange).toHaveBeenLastCalledWith({ image: "", emoji: "👨‍👩‍👧‍👦" });
    fireEvent.change(screen.getByLabelText("Eigenes Emoji"), { target: { value: "Bier" } });
    expect(screen.getByText("Bitte genau ein Emoji eingeben.")).toBeInTheDocument();
  });

  it("clears the emoji after a successful upload and shows upload errors", async () => {
    const onChange = vi.fn();
    const upload = vi.fn().mockResolvedValueOnce({ url: "/img/new.webp" }).mockResolvedValueOnce({ error: "Das Bild ist grösser als 4 MB." });
    render(<IconEditor label="Logo" value={{ image: "", emoji: "🍷" }} kind="logo" upload={upload} onChange={onChange} />);
    const file = new File(["image"], "logo.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Logo hochladen"), { target: { files: [file] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ image: "/img/new.webp", emoji: "" }));
    expect(upload).toHaveBeenCalledWith(file, "logo");
    fireEvent.change(screen.getByLabelText("Logo hochladen"), { target: { files: [file] } });
    expect(await screen.findByText("Das Bild ist grösser als 4 MB.")).toBeInTheDocument();
  });
});
