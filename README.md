# Barrechner.ch

Multi-Tenant-Preisrechner für Vereinsfeste und kleine Bars. Besitzer verwalten bis zu fünf Bars auf `barrechner.ch`; jedes Barteam verwendet seinen öffentlichen, offline-fähigen Rechner unter `{barname}.barrechner.ch`.

## Technik

- Next.js 16, React 19, TypeScript und Tailwind CSS 4
- Supabase Auth, Postgres mit Row Level Security und Storage
- Vercel Wildcard-Domain und täglicher Cleanup-Job
- Unveränderliche Veröffentlichungen mit getrenntem Entwurf
- Service Worker für den zuletzt geladenen Rechner

## Lokal starten

1. Ein Supabase-Projekt erstellen.
2. Die Migration in `supabase/migrations/20260820000000_initial.sql` ausführen (`supabase db push` mit verknüpftem Projekt).
3. `.env.example` nach `.env.local` kopieren und die Werte eintragen.
4. In Supabase Auth die Site URL und Redirect URLs für `http://localhost:3000/auth/callback` sowie die Produktionsdomain eintragen.
5. Abhängigkeiten installieren und starten:

```bash
npm install
npm run dev
```

Die Plattform läuft unter `http://localhost:3000`, lokale Bars unter `http://{slug}.localhost:3000`.

## Prüfen

```bash
npm test
npm run lint
npm run build
```

## Vercel einrichten

1. Alle Werte aus `.env.example` als Production- und Preview-Variablen setzen.
2. `barrechner.ch`, `www.barrechner.ch` und `*.barrechner.ch` zum Projekt hinzufügen. Für das Wildcard-Zertifikat die von Vercel verlangten Nameserver verwenden.
3. In Supabase die Produktions-Callback-URL `https://barrechner.ch/auth/callback` erlauben.
4. `CRON_SECRET` muss in Vercel gesetzt sein; Vercel sendet ihn automatisch als Bearer-Token an den täglichen Cleanup-Endpunkt.

Der Service-Role-Key wird ausschliesslich serverseitig verwendet und darf nie mit `NEXT_PUBLIC_` beginnen.

## Datenmodell und Sicherheit

Die Migration enthält alle Tabellen, Indizes, RLS-Regeln und transaktionalen Funktionen. Das Limit von fünf aktiven Bars, Slug-Wechsel, Publish, Archivierung und Wiederherstellung werden in der Datenbank atomar geprüft. Öffentliche Rechner werden serverseitig über den Service-Client gelesen; alle Verwaltungsaktionen prüfen zusätzlich den angemeldeten Benutzer und die RLS-Regeln.

Bestellungen verlassen das Gerät nicht. Sie werden pro Bar und veröffentlichter Version im Browser gespeichert und bei einer Preislistenänderung sicher verworfen.
