import Link from "next/link";
import { signOutAction } from "@/app/auth/actions";

export default function DashboardHeader({ email }: { email: string }) {
  return (
    <header className="dashboard-header">
      <Link href="/dashboard" className="flex items-center gap-3">
        <span className="brand-mark">B</span>
        <span><strong className="block text-slate-950">Barrechner</strong><span className="block text-xs text-slate-500">Barverwaltung</span></span>
      </Link>
      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-slate-500 sm:block">{email}</span>
        <form action={signOutAction}><button className="secondary-button small">Abmelden</button></form>
      </div>
    </header>
  );
}
