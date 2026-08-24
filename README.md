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
4. In Supabase Auth die Site URL und Redirect URLs für `http://localhost:3000/auth/callback` sowie die Produktionsdomain eintragen. Die App verschickt und prüft einen eigenen Bestätigungslink, damit neue Konten vorher 30 Tage lang genutzt werden können.
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

1. Alle Werte aus `.env.example` als Production- und Preview-Variablen setzen. Bei einer Vercel-Supabase-Integration mit dem Ressourcenpräfix `supabase_` verwendet die App automatisch `NEXT_PUBLIC_supabase_SUPABASE_PUBLISHABLE_KEY` und `supabase_SUPABASE_SECRET_KEY`; die manuellen Standardnamen sind dann nicht zusätzlich nötig.
2. `barrechner.ch`, `www.barrechner.ch` und `*.barrechner.ch` zum Projekt hinzufügen. Für das Wildcard-Zertifikat die von Vercel verlangten Nameserver verwenden.
3. In Supabase die Produktions-Callback-URL `https://barrechner.ch/auth/callback` erlauben.
4. `CRON_SECRET` muss in Vercel gesetzt sein; Vercel sendet ihn automatisch als Bearer-Token an den täglichen Cleanup-Endpunkt.

Der Secret- beziehungsweise Service-Role-Key wird ausschliesslich serverseitig verwendet und darf nie mit `NEXT_PUBLIC_` beginnen. Neue `sb_secret_…`-Schlüssel werden gegenüber dem alten `service_role`-JWT bevorzugt.

## Produktions-Deployments

Produktions-Deployments laufen über die nativen GitHub-Integrationen von Supabase und Vercel. Dafür sind keine Deployment-Secrets oder eigenen GitHub Actions nötig.

1. In Supabase unter **Project Settings → Integrations → GitHub** das Repository verbinden.
2. Als Working Directory `.` und als Production Branch `main` auswählen.
3. **Deploy to production** aktivieren, damit Supabase neue Dateien aus `supabase/migrations` automatisch anwendet.
4. Die normale GitHub-Integration des Vercel-Projekts aktiviert lassen.
5. In den Production-Environment-Einstellungen von Vercel unter **Deployment Checks** den Supabase-Produktionsstatus als erforderlichen Check hinzufügen.

Der Deployment Check ist wichtig: Supabase und Vercel reagieren unabhängig auf denselben Push. Vercel darf den fertigen Build erst der Produktionsdomain zuweisen, nachdem die Supabase-Migration erfolgreich abgeschlossen wurde. Schlägt sie fehl, bleibt die bisherige Version live.

Optional kann der Supabase-Preview-Check zusätzlich in den GitHub-Branch-Regeln für `main` als erforderlicher Status Check eingetragen werden. Fehlerhafte Migrationen können dann nicht gemergt werden.

Wurden ältere Migrationen bereits manuell ausgeführt, fehlen aber in der Supabase-Migrationshistorie, müssen sie einmalig vor dem ersten automatischen Deployment als angewendet markiert werden. Die noch ausstehende Migration darf dabei nicht als angewendet markiert werden:

```bash
npx supabase@latest migration repair 20260820000000 --status applied
npx supabase@latest migration repair 20260821000000 --status applied
npx supabase@latest db push --dry-run
```

## Datenmodell und Sicherheit

Die Migration enthält alle Tabellen, Indizes, RLS-Regeln und transaktionalen Funktionen. Das Limit von fünf aktiven Bars, Slug-Wechsel, Publish, Archivierung und Wiederherstellung werden in der Datenbank atomar geprüft. Öffentliche Rechner werden serverseitig über den Service-Client gelesen; alle Verwaltungsaktionen prüfen zusätzlich den angemeldeten Benutzer und die RLS-Regeln.

Bestellungen verlassen das Gerät nicht. Sie werden pro Bar und veröffentlichter Version im Browser gespeichert und bei einer Preislistenänderung sicher verworfen.
