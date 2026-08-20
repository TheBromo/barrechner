import Link from "next/link";

export default function HomePage() {
  return (
    <main className="landing-page">
      <nav className="landing-nav"><Link href="/" className="flex items-center gap-3"><span className="brand-mark">B</span><strong>barrechner.ch</strong></Link><div className="flex items-center gap-2"><Link href="/anmelden" className="secondary-button small">Anmelden</Link><Link href="/registrieren" className="primary-button small">Kostenlos starten</Link></div></nav>
      <section className="hero-section">
        <div className="hero-copy"><p className="eyebrow">Für Vereinsfeste, Quartierbars und kleine Events</p><h1>Tippen.<br />Total sehen.<br /><em>Weiterfeiern.</em></h1><p className="hero-lead">Der schnelle Preisrechner für dein Barteam. Eigene Karte, eigene Farben, eigene Webadresse — auf jedem Handy und auch ohne stabiles WLAN.</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/registrieren" className="primary-button large">Deine Bar erstellen</Link><a href="#so-gehts" className="secondary-button large">So funktioniert’s</a></div><p className="mt-5 text-sm text-slate-500">Kostenlos · bis zu 5 Bars · keine Serverkonten nötig</p></div>
        <div className="phone-stage" aria-label="Vorschau des Barrechners"><div className="phone"><div className="phone-top"><span className="demo-logo">S</span><div><strong>Sommerbar</strong><small>Barrechner</small></div></div><div className="demo-tabs"><span className="active">🍺<small>Bier</small></span><span>🍷<small>Wein</small></span><span>🥤<small>Alkoholfrei</small></span></div><div className="demo-grid"><DemoDrink name="Lager" size="3 dl" price="5.00" count="3" /><DemoDrink name="Panaché" size="3 dl" price="5.00" /><DemoDrink name="Weisswein" size="1 dl" price="6.00" count="1" /><DemoDrink name="Mineral" size="3 dl" price="3.00" /></div><div className="demo-total"><span>4</span><small>Bestellung ansehen</small><strong>CHF 21.00</strong></div></div><span className="offline-badge">● Funktioniert offline</span></div>
      </section>
      <section id="so-gehts" className="steps-section"><div><p className="eyebrow">In drei Schritten live</p><h2>Gemacht für Menschen,<br />die gerade anderes zu tun haben.</h2></div><ol><li><span>01</span><div><strong>Bar erstellen</strong><p>Name und einmalige Webadresse wählen.</p></div></li><li><span>02</span><div><strong>Karte anpassen</strong><p>Getränke, Preise, Logo und Farben eintragen.</p></div></li><li><span>03</span><div><strong>Link teilen</strong><p>Veröffentlichen und im Barteam öffnen.</p></div></li></ol></section>
      <footer className="landing-footer"><span>barrechner.ch</span><p>Einfach kassieren am nächsten Fest.</p><Link href="/registrieren">Jetzt starten →</Link></footer>
    </main>
  );
}

function DemoDrink({ name, size, price, count }: { name: string; size: string; price: string; count?: string }) {
  return <div className="demo-drink">{count && <b>{count}</b>}<strong>{name}</strong><span><small>{size}</small><em>{price}</em></span></div>;
}
