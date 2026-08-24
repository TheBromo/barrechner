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

Pushes auf `main` starten den Workflow `.github/workflows/production.yml`. Er führt zuerst alle ausstehenden Supabase-Migrationen aus und deployt die Anwendung nur dann zu Vercel, wenn die Migrationen erfolgreich waren. Der Workflow kann in GitHub Actions auch manuell gestartet werden.

Im GitHub-Repository müssen unter **Settings → Secrets and variables → Actions** folgende Secrets hinterlegt sein:

- `SUPABASE_ACCESS_TOKEN`: persönlicher Supabase-Access-Token
- `SUPABASE_DB_PASSWORD`: Datenbankpasswort des Produktionsprojekts
- `SUPABASE_PROJECT_ID`: Project Ref des Supabase-Produktionsprojekts
- `VERCEL_TOKEN`: Vercel-Access-Token
- `VERCEL_ORG_ID`: Team- beziehungsweise Benutzer-ID aus `.vercel/project.json`
- `VERCEL_PROJECT_ID`: Projekt-ID aus `.vercel/project.json`

Der Job verwendet zusätzlich das GitHub-Environment `production`. In Vercel muss der automatische Production-Deploy über die Git-Integration deaktiviert werden, damit ein Push nicht parallel zum migrationsgesteuerten Workflow einen zweiten Deploy auslöst. Preview-Deployments können aktiviert bleiben.

Wurden ältere Migrationen bereits manuell ausgeführt, fehlen aber in der Supabase-Migrationshistorie, müssen sie einmalig vor dem ersten automatischen Deployment als angewendet markiert werden. Die noch ausstehende Migration darf dabei nicht als angewendet markiert werden:

```bash
npx supabase@latest migration repair 20260820000000 --status applied
npx supabase@latest migration repair 20260821000000 --status applied
npx supabase@latest db push --dry-run
```

## Datenmodell und Sicherheit

Die Migration enthält alle Tabellen, Indizes, RLS-Regeln und transaktionalen Funktionen. Das Limit von fünf aktiven Bars, Slug-Wechsel, Publish, Archivierung und Wiederherstellung werden in der Datenbank atomar geprüft. Öffentliche Rechner werden serverseitig über den Service-Client gelesen; alle Verwaltungsaktionen prüfen zusätzlich den angemeldeten Benutzer und die RLS-Regeln.

Bestellungen verlassen das Gerät nicht. Sie werden pro Bar und veröffentlichter Version im Browser gespeichert und bei einer Preislistenänderung sicher verworfen.
