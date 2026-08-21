import type { Metadata, Viewport } from "next";
import { platformOrigin } from "@/lib/urls";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(platformOrigin()),
  title: { default: "Barrechner – Schnell kassieren am Fest", template: "%s · Barrechner" },
  description: "Der schnelle, anpassbare und offline-fähige Preisrechner für Vereinsfeste und kleine Bars.",
  applicationName: "Barrechner",
  manifest: "/manifest.webmanifest",
  openGraph: { title: "Barrechner", description: "Eigene Getränkekarte, eigene Webadresse, schneller kassieren.", type: "website", locale: "de_CH", images: [{ url: "/og.png", width: 1200, height: 630, alt: "Barrechner.ch – Tippen. Total sehen. Weiterfeiern." }] },
  twitter: { card: "summary_large_image", title: "Barrechner", description: "Eigene Getränkekarte, eigene Webadresse, schneller kassieren.", images: ["/og.png"] },
};

export const viewport: Viewport = { themeColor: "#101a17", width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="de-CH" className="h-full antialiased"><body className="min-h-full">{children}</body></html>;
}
