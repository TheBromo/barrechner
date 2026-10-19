import { Link, Outlet, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { getViewer, signOut } from "~/functions/auth";
import { formatSwissDate } from "~/lib/email-verification";

export const Route = createFileRoute("/dashboard")({
  // Navigation guard only; every dashboard server function checks the session itself.
  beforeLoad: async ({ location }) => {
    const viewer = await getViewer();
    if (!viewer) throw redirect({ to: "/anmelden" });
    if (viewer.verification.status === "required") throw redirect({ to: "/email-bestaetigen" });
    return { viewer, path: location.pathname };
  },
  head: () => ({ meta: [{ title: "Barverwaltung · Barrechner" }, { name: "robots", content: "noindex" }] }),
  component: DashboardLayout,
});

function DashboardLayout() {
  const { viewer } = Route.useRouteContext();
  const router = useRouter();
  return (
    <div className="min-h-dvh bg-[#f5f3ec]">
      <header className="dashboard-header">
        <Link to="/dashboard" className="flex items-center gap-3">
          <span className="brand-mark">B</span>
          <span><strong className="block text-slate-950">Barrechner</strong><span className="block text-xs text-slate-500">Barverwaltung</span></span>
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/dashboard/konto" className="hidden text-sm text-slate-500 hover:text-slate-950 sm:block">{viewer.email}</Link>
          <Link to="/dashboard/konto" className="text-sm font-bold text-slate-600 sm:hidden">Konto</Link>
          <button className="secondary-button small" onClick={async () => { await signOut(); await router.navigate({ to: "/" }); }}>Abmelden</button>
        </div>
      </header>
      {viewer.verification.status === "grace" && (
        <div className="border-b border-amber-300 bg-amber-100 px-5 py-3 text-center text-sm text-amber-950">
          Bitte bestätige deine E-Mail-Adresse bis am {formatSwissDate(viewer.verification.requiredBy)}.{" "}
          <Link className="font-extrabold underline" to="/email-bestaetigen">Bestätigungslink erneut senden</Link>
        </div>
      )}
      <Outlet />
    </div>
  );
}
