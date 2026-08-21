// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { uploadAssetAction } = vi.hoisted(() => ({ uploadAssetAction: vi.fn() }));

vi.mock("@/app/dashboard/actions", () => ({
  discardDraftAction: vi.fn(),
  publishBarAction: vi.fn(),
  renameBarAction: vi.fn(),
  saveDraftAction: vi.fn(),
  uploadAssetAction,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { IconEditor } from "./AdminEditor";

describe("icon editor", () => {
  beforeEach(() => uploadAssetAction.mockReset());

  it("switches between curated and custom emoji", () => {
    const onChange = vi.fn();
    render(<IconEditor label="Logo" value={{ image: "https://example.com/logo.webp", emoji: "" }} barId="bar-1" kind="logo" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "🍺 auswählen" }));
    expect(onChange).toHaveBeenLastCalledWith({ image: "", emoji: "🍺" });

    fireEvent.change(screen.getByLabelText("Eigenes Emoji"), { target: { value: "👨‍👩‍👧‍👦" } });
    expect(onChange).toHaveBeenLastCalledWith({ image: "", emoji: "👨‍👩‍👧‍👦" });

    fireEvent.change(screen.getByLabelText("Eigenes Emoji"), { target: { value: "Bier" } });
    expect(screen.getByText("Bitte genau ein Emoji eingeben.")).toBeTruthy();
  });

  it("clears emoji after a successful picture upload", async () => {
    uploadAssetAction.mockResolvedValue({ url: "https://example.com/new.webp" });
    const onChange = vi.fn();
    const { container } = render(<IconEditor label="Logo" value={{ image: "", emoji: "🍷" }} barId="bar-1" kind="logo" onChange={onChange} />);
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const file = new File(["image"], "logo.png", { type: "image/png" });
    fireEvent.change(fileInput!, { target: { files: [file] } });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ image: "https://example.com/new.webp", emoji: "" }));
  });
});
