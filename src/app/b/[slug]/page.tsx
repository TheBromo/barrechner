import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Calculator from "@/components/Calculator";
import { getPublicBar } from "@/lib/data";
import { platformOrigin, tenantOrigin } from "@/lib/urls";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPublicBar(slug);
  if (result.kind !== "published") return { title: "Barrechner", robots: { index: false, follow: false } };
  return { title: result.config.displayName, description: `Preisrechner für ${result.config.displayName}`, applicationName: result.config.displayName, appleWebApp: { capable: true, title: result.config.displayName, statusBarStyle: "black-translucent" }, manifest: "/manifest.webmanifest" };
}

export default async function TenantPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await getPublicBar(slug);
  if (result.kind === "redirect") redirect(tenantOrigin(result.slug));
  if (result.kind === "published") return <Calculator menu={result.config} slug={slug} />;
  const copy = result.kind === "archived" ? ["Diese Bar ist archiviert.", "Der Rechner ist zurzeit nicht verfügbar."] : result.kind === "unpublished" ? ["Diese Bar wird gerade eingerichtet.", "Sobald die Getränkekarte veröffentlicht ist, erscheint hier der Rechner."] : ["Bar nicht gefunden.", "Prüfe die eingegebene Webadresse."];
  return <main className="tenant-status"><span className="brand-mark">B</span><h1>{copy[0]}</h1><p>{copy[1]}</p><a href={platformOrigin()}>Zu barrechner.ch</a></main>;
}
