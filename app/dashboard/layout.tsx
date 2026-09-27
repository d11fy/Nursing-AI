import { AppShell } from "@/components/dashboard/app-shell";
import { requireProfile } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();

  return (
    <AppShell area="student" homeHref="/dashboard" fullName={profile.full_name}>
      {children}
    </AppShell>
  );
}
