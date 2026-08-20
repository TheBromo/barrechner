import { requireUser } from "@/lib/auth";
import DashboardHeader from "@/components/DashboardHeader";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <div className="min-h-dvh bg-[#f5f3ec]"><DashboardHeader email={user.email ?? ""} />{children}</div>;
}
