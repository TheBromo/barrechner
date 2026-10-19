import type { ReactNode } from "react";
import { HeadContent, Link, Outlet, Scripts, createRootRoute, useRouter } from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { StatusCard } from "~/components/StatusCard";

const DESCRIPTION = "Der schnelle, anpassbare und offline-fähige Preisrechner für Vereinsfeste und kleine Bars.";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" },
      { name: "theme-color", content: "#101a17" },
      { title: "Barrechner – Schnell kassieren am Fest" },
      { name: "description", content: DESCRIPTION },
      { name: "application-name", content: "Barrechner" },
      { property: "og:title", content: "Barrechner" },
      { property: "og:description", content: "Eigene Getränkekarte, eigene Webadresse, schneller kassieren." },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "de_CH" },
      { property: "og:image", content: "/og.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/icon-192.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  component: () => <Document><Outlet /></Document>,
  notFoundComponent: NotFound,
  errorComponent: ErrorPage,
});

function Document({ children }: { children: ReactNode }) {
  return (
    <html lang="de-CH" className="h-full antialiased">
      <head><HeadContent /></head>
      <body className="min-h-full">{children}<Scripts /></body>
    </html>
  );
}

function NotFound() {
  return (
    <StatusCard title="Seite nicht gefunden">
      <p className="mt-3 text-sm leading-6 text-slate-600">Prüfe die eingegebene Webadresse.</p>
      <Link to="/" className="secondary-button mt-7 w-full">Zur Startseite</Link>
    </StatusCard>
  );
}

function ErrorPage() {
  const router = useRouter();
  return (
    <StatusCard title="Etwas ist schiefgelaufen">
      <p className="mt-3 text-sm leading-6 text-slate-600">Die Aktion konnte nicht abgeschlossen werden. Bitte versuche es erneut.</p>
      <div className="mt-7 grid gap-3">
        <button onClick={() => router.invalidate()} className="primary-button w-full">Erneut versuchen</button>
        <Link to="/dashboard" className="secondary-button w-full">Zur Übersicht</Link>
      </div>
    </StatusCard>
  );
}
