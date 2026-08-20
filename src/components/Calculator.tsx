"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import type { Category, Drink, Menu, Variant } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { themeVariables } from "@/lib/theme";
import { decodeStoredOrder, encodeStoredOrder, type OrderLine } from "@/lib/order-storage";
import { platformOrigin } from "@/lib/urls";

export default function Calculator({ menu, slug, preview = false }: { menu: Menu; slug: string; preview?: boolean }) {
  const storageKey = `barrechner-order:${slug}`;
  const categories = menu.categories.filter((c) => c.drinks.some((d) => d.active));
  const [activeCat, setActiveCat] = useState(categories[0]?.id ?? "");
  const [order, setOrder] = useState<OrderLine[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [staleNotice, setStaleNotice] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // restore a half-finished order after reload / phone lock;
  // must run post-hydration because the server renders without localStorage
  useEffect(() => {
    const stored = decodeStoredOrder(localStorage.getItem(storageKey), menu.revision);
    if (stored.stale) localStorage.removeItem(storageKey);
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage is an external system and must hydrate after mount. */
    setOrder(stored.lines);
    setStaleNotice(stored.stale);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [menu.revision, storageKey]);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, encodeStoredOrder(menu.revision, order));
    } catch {
      // storage full/blocked — order just won't survive a reload
    }
  }, [menu.revision, order, storageKey]);
  useEffect(() => {
    if (!preview && "serviceWorker" in navigator) {
      void (async () => {
        const registration = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const loadedResources = performance.getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((url) => url.startsWith(location.origin));
        const tenantImages = [menu.logoUrl, ...menu.categories.map((category) => category.image)].filter(Boolean);
        registration.active?.postMessage({ type: "CACHE_PAGE", urls: ["/", ...loadedResources, ...tenantImages] });
      })();
    }
  }, [menu.categories, menu.logoUrl, preview]);

  const total = order.reduce((sum, l) => sum + l.price * l.qty, 0);
  const count = order.reduce((sum, l) => sum + l.qty, 0);
  const qtyByKey = new Map(order.map((l) => [l.key, l.qty]));

  function addItem(drink: Drink, variant: Variant) {
    const key = `${drink.id}:${variant.id}`;
    setOrder((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...prev,
        { key, drinkName: drink.name, variantLabel: variant.label, price: variant.price, qty: 1 },
      ];
    });
  }

  function removeOne(key: string) {
    setOrder((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, qty: l.qty - 1 } : l))
        .filter((l) => l.qty > 0)
    );
  }

  function clearOrder() {
    if (!confirmClear) {
      setConfirmClear(true);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirmClear(false), 2500);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmClear(false);
    setOrder([]);
    setSheetOpen(false);
  }

  const category = categories.find((c) => c.id === activeCat) ?? categories[0];

  return (
    <div className="calculator-theme flex h-dvh flex-col" style={themeVariables(menu.theme.background, menu.theme.accent) as CSSProperties}>
      <header className="flex items-center gap-3 px-4 pt-3 pb-2">
        {/* Uploaded tenant assets can live on the configured Supabase storage host. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {menu.logoUrl ? <img src={menu.logoUrl} alt="" className="h-9 w-9 rounded-lg object-cover" /> : <span className="calculator-logo">{menu.displayName.slice(0, 1).toUpperCase()}</span>}
        <div className="flex-1">
          <h1 className="text-lg font-bold leading-none tracking-wide">{menu.displayName}</h1>
          <p className="mt-0.5 text-[11px] opacity-50">Barrechner</p>
        </div>
        <Link
          href={preview ? "/dashboard" : `${platformOrigin()}/dashboard`}
          aria-label="Bar verwalten"
          className="rounded-lg p-2 opacity-40 transition-opacity hover:opacity-80"
        >
          <GearIcon />
        </Link>
      </header>

      {staleNotice && <button onClick={() => setStaleNotice(false)} className="revision-notice">Die Getränkekarte wurde aktualisiert. Die alte Bestellung wurde geleert. <strong>OK</strong></button>}

      <nav className="flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
        {categories.map((c) => (
          <CategoryChip
            key={c.id}
            category={c}
            active={c.id === category?.id}
            onSelect={() => setActiveCat(c.id)}
          />
        ))}
      </nav>

      <main className="flex-1 overflow-y-auto border-t border-white/5 px-3 pt-3 pb-6">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {category?.drinks
            .filter((d) => d.active)
            .flatMap((drink) =>
              drink.variants.map((variant) => (
                <DrinkButton
                  key={`${drink.id}:${variant.id}`}
                  drink={drink}
                  variant={variant}
                  qty={qtyByKey.get(`${drink.id}:${variant.id}`) ?? 0}
                  onAdd={() => addItem(drink, variant)}
                />
              ))
            )}
        </div>
      </main>

      {sheetOpen && count > 0 && (
        <section className="max-h-[45dvh] overflow-y-auto border-t border-white/10 bg-board-900">
          <p className="px-4 pt-3 pb-1 text-[11px] text-white/40">
            Tippe uf ä Zilä zum eis wägnäh
          </p>
          <ul>
            {order.map((line) => (
              <li key={line.key}>
                <button
                  onClick={() => removeOne(line.key)}
                  className="flex w-full items-center gap-3 border-b border-white/5 px-4 py-3 text-left transition-colors active:bg-board-700"
                >
                  <span className="min-w-9 rounded-md bg-board-700 px-1.5 py-1 text-center text-sm font-bold tabular-nums text-amber-400">
                    {line.qty}×
                  </span>
                  <span className="flex-1 leading-tight">
                    <span className="block text-[15px] font-medium">{line.drinkName}</span>
                    <span className="block text-xs text-white/45">
                      {line.variantLabel} · {formatPrice(line.price)}
                    </span>
                  </span>
                  <span className="text-[15px] font-semibold tabular-nums">
                    {formatPrice(line.price * line.qty)}
                  </span>
                  <MinusIcon />
                </button>
              </li>
            ))}
          </ul>
          <div className="px-4 py-3">
            <button
              onClick={clearOrder}
              className={`w-full rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                confirmClear
                  ? "border-red-500 bg-red-500/20 text-red-300"
                  : "border-white/10 text-white/60 active:bg-board-700"
              }`}
            >
              {confirmClear ? "Würkli? Nomal tippe zum lösche" : "Alles lösche"}
            </button>
          </div>
        </section>
      )}

      <footer className="border-t border-white/10 bg-board-900 pb-safe">
        <button
          onClick={() => count > 0 && setSheetOpen((o) => !o)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <span
            className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-bold tabular-nums ${
              count > 0 ? "bg-amber-400 text-board-950" : "bg-board-700 text-white/40"
            }`}
          >
            {count}
          </span>
          <span className="flex-1 text-sm text-white/50">
            {count === 0 ? "Kei Artikel — tipp uf es Getränk" : sheetOpen ? "Zuäklappe" : "Bstellig aaluege"}
          </span>
          <span className="text-3xl font-bold tabular-nums tracking-tight text-amber-400">
            {formatPrice(total)}
          </span>
          <ChevronIcon open={sheetOpen} muted={count === 0} />
        </button>
      </footer>
    </div>
  );
}

function CategoryChip({
  category,
  active,
  onSelect,
}: {
  category: Category;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex shrink-0 flex-col items-center gap-1 rounded-xl border px-3.5 pt-2.5 pb-1.5 transition-colors ${
        active
          ? "category-chip-active bg-board-800 text-chalk"
          : "border-white/10 text-white/55 active:bg-board-800"
      }`}
    >
      {category.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={category.image} alt="" className="h-10 w-10 object-contain" />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center text-lg">🍹</span>
      )}
      <span className="max-w-32 truncate text-[11px] font-medium">{category.name}</span>
    </button>
  );
}

function DrinkButton({
  drink,
  variant,
  qty,
  onAdd,
}: {
  drink: Drink;
  variant: Variant;
  qty: number;
  onAdd: () => void;
}) {
  return (
    <button
      onClick={onAdd}
      className="relative flex min-h-24 flex-col justify-between rounded-xl border border-white/10 bg-board-900 p-3 text-left transition-[background-color,transform] duration-75 active:scale-[0.97] active:bg-board-700"
    >
      {qty > 0 && (
        <span className="absolute -top-1.5 -right-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-400 px-1.5 text-[13px] font-bold tabular-nums text-board-950">
          {qty}
        </span>
      )}
      <span>
        <span className="block text-[15px] font-semibold leading-tight">{drink.name}</span>
        {drink.note && (
          <span className="mt-0.5 line-clamp-1 block text-[11px] text-white/40">{drink.note}</span>
        )}
      </span>
      <span className="mt-2 flex items-baseline justify-between">
        <span className="text-xs font-medium text-white/50">{variant.label}</span>
        <span className="text-lg font-bold tabular-nums text-amber-400">
          {formatPrice(variant.price)}
        </span>
      </span>
    </button>
  );
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-red-400/70" aria-hidden>
      <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function ChevronIcon({ open, muted }: { open: boolean; muted: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform ${open ? "rotate-180" : ""} ${muted ? "text-white/20" : "text-white/50"}`}
      aria-hidden
    >
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}
