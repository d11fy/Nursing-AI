import { AppShell } from "@/components/dashboard/app-shell";
import { studentNavItems } from "@/components/dashboard/nav-items";
import { requireProfile } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();

  return (
    <AppShell navItems={studentNavItems} homeHref="/dashboard" fullName={profile.full_name}>
      {children}
    </AppShell>
  );
}
