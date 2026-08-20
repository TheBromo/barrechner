import Link from "next/link";
import Calculator from "@/components/Calculator";
import { getOwnedBar } from "@/lib/data";

export default async function PreviewPage({ params }: { params: Promise<{ barId: string }> }) {
  const { barId } = await params;
  const { config } = await getOwnedBar(barId);
  return <div className="relative"><div className="preview-banner"><span>Entwurfsvorschau</span><Link href={`/dashboard/bars/${barId}`}>Zurück zum Editor</Link></div><Calculator menu={config} slug={`preview-${barId}`} preview /></div>;
}
