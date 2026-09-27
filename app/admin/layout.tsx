import { AppShell } from "@/components/dashboard/app-shell";
import { requireAdminProfile } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireAdminProfile();

  return (
    <AppShell area="admin" homeHref="/admin" fullName={profile.full_name}>
      {children}
    </AppShell>
  );
}
