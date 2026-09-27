import { AppShell } from "@/components/dashboard/app-shell";
import { adminNavItems } from "@/components/dashboard/nav-items";
import { requireAdminProfile } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireAdminProfile();

  return (
    <AppShell navItems={adminNavItems} homeHref="/admin" fullName={profile.full_name}>
      {children}
    </AppShell>
  );
}
