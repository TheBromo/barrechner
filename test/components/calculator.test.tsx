// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Calculator from "~/components/Calculator";
import { starterConfig } from "~/lib/seed";
import { encodeStoredOrder } from "~/lib/order-storage";

const menu = () => ({ ...starterConfig("Mondbar"), revision: 3 });

describe("calculator", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("adds drinks, totals in francs and removes lines from the order sheet", async () => {
    render(<Calculator menu={menu()} storageId="mondbar" manageUrl="https://barrechner.ch/dashboard" />);
    fireEvent.click(screen.getByRole("button", { name: /Lager/ }));
    fireEvent.click(screen.getByRole("button", { name: /Lager/ }));
    fireEvent.click(screen.getByRole("button", { name: /Wein/ }));
    fireEvent.click(screen.getByRole("button", { name: /Weisswein.*75 cl/ }));
    expect(screen.getByTestId("order-total").textContent).toBe("46.–");
    expect(screen.getByTestId("order-count").textContent).toBe("3");

    fireEvent.click(screen.getByRole("button", { name: /Bstellig aaluege/ }));
    fireEvent.click(screen.getByRole("button", { name: /2×\s*Lager/ }));
    expect(screen.getByTestId("order-total").textContent).toBe("41.–");
    expect(JSON.parse(localStorage.getItem("barrechner-order:mondbar")!)).toMatchObject({ revision: 3, lines: [{ key: "lager:3dl", qty: 1 }, { key: "weisswein:75cl", qty: 1 }] });
  });

  it("needs a second tap within 2.5 seconds to clear the order", () => {
    vi.useFakeTimers();
    render(<Calculator menu={menu()} storageId="mondbar" manageUrl="/dashboard" />);
    fireEvent.click(screen.getByRole("button", { name: /Lager/ }));
    fireEvent.click(screen.getByRole("button", { name: /Bstellig aaluege/ }));
    fireEvent.click(screen.getByRole("button", { name: "Alles lösche" }));
    expect(screen.getByRole("button", { name: "Würkli? Nomal tippe zum lösche" })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(2600); });
    fireEvent.click(screen.getByRole("button", { name: "Alles lösche" }));
    fireEvent.click(screen.getByRole("button", { name: "Würkli? Nomal tippe zum lösche" }));
    expect(screen.getByTestId("order-total").textContent).toBe("0.–");
  });

  it("restores an order of the same version and discards one from an older version with a notice", () => {
    localStorage.setItem("barrechner-order:mondbar", encodeStoredOrder(3, [{ key: "lager:3dl", drinkName: "Lager", variantLabel: "3 dl", price: 500, qty: 2 }]));
    render(<Calculator menu={menu()} storageId="mondbar" manageUrl="/dashboard" />);
    expect(screen.getByTestId("order-total").textContent).toBe("10.–");
    cleanup();

    localStorage.setItem("barrechner-order:mondbar", encodeStoredOrder(2, [{ key: "lager:3dl", drinkName: "Lager", variantLabel: "3 dl", price: 500, qty: 2 }]));
    render(<Calculator menu={menu()} storageId="mondbar" manageUrl="/dashboard" />);
    expect(screen.getByTestId("order-total").textContent).toBe("0.–");
    expect(screen.getByText(/Die Getränkekarte wurde aktualisiert/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("barrechner-order:mondbar")!)).toEqual({ revision: 3, lines: [] });
  });

  it("hides inactive drinks and categories without active drinks", () => {
    const config = menu();
    config.categories[0].drinks[1].active = false;
    config.categories[2].drinks.forEach((drink) => { drink.active = false; });
    render(<Calculator menu={config} storageId="mondbar" manageUrl="/dashboard" />);
    expect(screen.queryByText("Panaché")).toBeNull();
    expect(screen.queryByRole("button", { name: /Alkoholfrei/ })).toBeNull();
  });

  it("renders configured emoji, the fallback icon and images before emoji", () => {
    const config = menu();
    config.logoEmoji = "🌙";
    config.categories[0].emoji = "🫗";
    config.categories[1].emoji = "";
    const html = renderToStaticMarkup(<Calculator menu={config} storageId="x" manageUrl="/dashboard" />);
    expect(html).toContain("🌙");
    expect(html).toContain("🫗");
    expect(html).toContain("🍹");

    config.logoUrl = "/img/logo.webp";
    config.categories[0].image = "/img/beer.webp";
    const withImages = renderToStaticMarkup(<Calculator menu={config} storageId="x" manageUrl="/dashboard" />);
    expect(withImages).toContain("/img/logo.webp");
    expect(withImages).not.toContain("🌙");
    expect(withImages).not.toContain("🫗");
  });
});
