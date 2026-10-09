import { AppShell } from "@/components/dashboard/app-shell";
import { requireAdminProfile } from "@/lib/auth";
import type { Metadata } from "next";

// Admin pages are never indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireAdminProfile();

  return (
    <AppShell area="admin" homeHref="/admin" fullName={profile.full_name}>
      {children}
    </AppShell>
  );
}
