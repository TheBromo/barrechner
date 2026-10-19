import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { BarConfig, Category, Drink, Variant } from "~/lib/types";
import { formatPrice } from "~/lib/format";
import { themeVariables } from "~/lib/theme";
import { decodeStoredOrder, encodeStoredOrder, orderStorageKey, type OrderLine } from "~/lib/order-storage";

type Props = {
  menu: BarConfig;
  /** Order storage namespace: the bar's slug, or a preview-specific key. */
  storageId: string;
  /** Link behind the gear icon. */
  manageUrl: string;
  /** Register the service worker so the calculator keeps working offline. */
  offline?: boolean;
};

export default function Calculator({ menu, storageId, manageUrl, offline = false }: Props) {
  const storageKey = orderStorageKey(storageId);
  const categories = menu.categories.filter((category) => category.drinks.some((drink) => drink.active));
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id ?? "");
  const [order, setOrder] = useState<OrderLine[]>([]);
  const [restored, setRestored] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [staleNotice, setStaleNotice] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore a half-finished order after reload or phone lock. Runs after hydration because the
  // server renders without localStorage.
  useEffect(() => {
    let raw: string | null = null;
    try { raw = localStorage.getItem(storageKey); } catch { /* storage blocked */ }
    // A stale order is not removed here: the save effect below overwrites it with the new
    // revision, which keeps this effect idempotent when React runs it twice.
    const stored = decodeStoredOrder(raw, menu.revision);
    setOrder(stored.lines);
    setStaleNotice(stored.stale);
    setRestored(true);
  }, [menu.revision, storageKey]);

  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(storageKey, encodeStoredOrder(menu.revision, order));
    } catch {
      // Storage full or blocked: the order just won't survive a reload.
    }
  }, [menu.revision, order, restored, storageKey]);

  useEffect(() => {
    if (!offline || !("serviceWorker" in navigator)) return;
    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const loaded = performance.getEntriesByType("resource").map((entry) => entry.name).filter((url) => url.startsWith(location.origin));
        const barImages = [menu.logoUrl, ...menu.categories.map((category) => category.image)].filter(Boolean);
        registration.active?.postMessage({ type: "CACHE_PAGE", urls: ["/", ...loaded, ...barImages] });
      } catch {
        // Offline support is best effort.
      }
    })();
  }, [menu.categories, menu.logoUrl, offline]);

  useEffect(() => () => { if (confirmTimer.current) clearTimeout(confirmTimer.current); }, []);

  const total = order.reduce((sum, line) => sum + line.price * line.qty, 0);
  const count = order.reduce((sum, line) => sum + line.qty, 0);
  const qtyByKey = new Map(order.map((line) => [line.key, line.qty]));

  function addItem(drink: Drink, variant: Variant) {
    const key = `${drink.id}:${variant.id}`;
    setOrder((previous) => previous.some((line) => line.key === key)
      ? previous.map((line) => (line.key === key ? { ...line, qty: line.qty + 1 } : line))
      : [...previous, { key, drinkName: drink.name, variantLabel: variant.label, price: variant.price, qty: 1 }]);
  }

  function removeOne(key: string) {
    setOrder((previous) => previous.map((line) => (line.key === key ? { ...line, qty: line.qty - 1 } : line)).filter((line) => line.qty > 0));
  }

  function clearOrder() {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    if (!confirmClear) {
      setConfirmClear(true);
      confirmTimer.current = setTimeout(() => setConfirmClear(false), 2500);
      return;
    }
    setConfirmClear(false);
    setOrder([]);
    setSheetOpen(false);
  }

  const category = categories.find((item) => item.id === activeCategory) ?? categories[0];

  return (
    <div className="calculator-theme flex h-dvh flex-col" data-ready={restored} style={themeVariables(menu.theme.background, menu.theme.accent) as CSSProperties}>
      <header className="flex items-center gap-3 px-4 pt-3 pb-2">
        {menu.logoUrl
          ? <img src={menu.logoUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
          : <span className="calculator-logo">{menu.logoEmoji || menu.displayName.slice(0, 1).toUpperCase()}</span>}
        <div className="flex-1">
          <h1 className="text-lg font-bold leading-none tracking-wide">{menu.displayName}</h1>
          <p className="theme-muted mt-0.5 text-[11px]">Barrechner</p>
        </div>
        <a href={manageUrl} aria-label="Bar verwalten" className="theme-muted rounded-lg p-2 transition-colors hover:text-[var(--bar-text)]">
          <GearIcon />
        </a>
      </header>

      {staleNotice && (
        <button onClick={() => setStaleNotice(false)} className="revision-notice">
          Die Getränkekarte wurde aktualisiert. Die alte Bestellung wurde geleert. <strong>OK</strong>
        </button>
      )}

      <nav className="flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none]" aria-label="Kategorien">
        {categories.map((item) => (
          <CategoryChip key={item.id} category={item} active={item.id === category?.id} onSelect={() => setActiveCategory(item.id)} />
        ))}
      </nav>

      <main className="theme-border flex-1 overflow-y-auto border-t px-3 pt-3 pb-6">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {category?.drinks
            .filter((drink) => drink.active)
            .flatMap((drink) => drink.variants.map((variant) => (
              <DrinkButton
                key={`${drink.id}:${variant.id}`}
                drink={drink}
                variant={variant}
                qty={qtyByKey.get(`${drink.id}:${variant.id}`) ?? 0}
                onAdd={() => addItem(drink, variant)}
              />
            )))}
        </div>
      </main>

      {sheetOpen && count > 0 && (
        <section className="theme-border max-h-[45dvh] overflow-y-auto border-t bg-board-900" aria-label="Bestellung">
          <p className="theme-muted px-4 pt-3 pb-1 text-[11px]">Tippe uf ä Zilä zum eis wägnäh</p>
          <ul>
            {order.map((line) => (
              <li key={line.key}>
                <button onClick={() => removeOne(line.key)} className="theme-border flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors active:bg-board-700">
                  <span className="min-w-9 rounded-md bg-board-700 px-1.5 py-1 text-center text-sm font-bold tabular-nums text-amber-400">{line.qty}×</span>
                  <span className="flex-1 leading-tight">
                    <span className="block text-[15px] font-medium">{line.drinkName}</span>
                    <span className="theme-muted block text-xs">{line.variantLabel} · {formatPrice(line.price)}</span>
                  </span>
                  <span className="text-[15px] font-semibold tabular-nums">{formatPrice(line.price * line.qty)}</span>
                  <MinusIcon />
                </button>
              </li>
            ))}
          </ul>
          <div className="px-4 py-3">
            <button
              onClick={clearOrder}
              className={`w-full rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${confirmClear ? "theme-danger theme-danger-surface" : "theme-border theme-muted active:bg-board-700"}`}
            >
              {confirmClear ? "Würkli? Nomal tippe zum lösche" : "Alles lösche"}
            </button>
          </div>
        </section>
      )}

      <footer className="theme-border border-t bg-board-900 pb-safe">
        <button onClick={() => count > 0 && setSheetOpen((open) => !open)} className="flex w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={sheetOpen}>
          <span className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-bold tabular-nums ${count > 0 ? "bg-amber-400 text-board-950" : "theme-muted bg-board-700"}`} data-testid="order-count">
            {count}
          </span>
          <span className="theme-muted flex-1 text-sm">{count === 0 ? "Kei Artikel — tipp uf es Getränk" : sheetOpen ? "Zuäklappe" : "Bstellig aaluege"}</span>
          <span className="text-3xl font-bold tabular-nums tracking-tight text-amber-400" data-testid="order-total">{formatPrice(total)}</span>
          <ChevronIcon open={sheetOpen} muted={count === 0} />
        </button>
      </footer>
    </div>
  );
}

function CategoryChip({ category, active, onSelect }: { category: Category; active: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={active}
      className={`flex shrink-0 flex-col items-center gap-1 rounded-xl border px-3.5 pt-2.5 pb-1.5 transition-colors ${active ? "category-chip-active bg-board-800 text-chalk" : "theme-border theme-muted active:bg-board-800"}`}
    >
      {category.image
        ? <img src={category.image} alt="" className="h-10 w-10 object-contain" />
        : <span className="flex h-10 w-10 items-center justify-center text-2xl" aria-hidden>{category.emoji || "🍹"}</span>}
      <span className="max-w-32 truncate text-[11px] font-medium">{category.name}</span>
    </button>
  );
}

function DrinkButton({ drink, variant, qty, onAdd }: { drink: Drink; variant: Variant; qty: number; onAdd: () => void }) {
  return (
    <button onClick={onAdd} className="theme-border relative flex min-h-24 flex-col justify-between rounded-xl border bg-board-900 p-3 text-left transition-[background-color,transform] duration-75 active:scale-[0.97] active:bg-board-700">
      {qty > 0 && (
        <span className="absolute -top-1.5 -right-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-400 px-1.5 text-[13px] font-bold tabular-nums text-board-950">{qty}</span>
      )}
      <span>
        <span className="block text-[15px] font-semibold leading-tight">{drink.name}</span>
        {drink.note && <span className="theme-muted mt-0.5 line-clamp-1 block text-[11px]">{drink.note}</span>}
      </span>
      <span className="mt-2 flex items-baseline justify-between">
        <span className="theme-muted text-xs font-medium">{variant.label}</span>
        <span className="text-lg font-bold tabular-nums text-amber-400">{formatPrice(variant.price)}</span>
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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="theme-danger" aria-hidden>
      <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function ChevronIcon({ open, muted }: { open: boolean; muted: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`theme-muted transition-transform ${open ? "rotate-180" : ""} ${muted ? "invisible" : ""}`} aria-hidden>
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}
