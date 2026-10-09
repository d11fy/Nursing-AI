import { AppShell } from "@/components/dashboard/app-shell";
import { requireProfile } from "@/lib/auth";
import type { Metadata } from "next";

// Private student and admin areas are never indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();

  return (
    <AppShell area="student" homeHref="/dashboard" fullName={profile.full_name}>
      {children}
    </AppShell>
  );
}
