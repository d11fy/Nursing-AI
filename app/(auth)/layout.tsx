import Link from "next/link";
import { BrandMark } from "@/components/brand/brand-mark";
import type { Metadata } from "next";

// Sign-in, recovery and OAuth hand-off pages are not search landing pages.
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="landing-grid relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-8 sm:py-12">
      <div className="pointer-events-none absolute inset-0 bg-card/45" />
      <div className="relative w-full max-w-md">
        <Link
          href="/"
          className="mb-8 flex justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BrandMark stacked />
        </Link>
        <div className="section-surface p-5 shadow-[0_20px_60px_rgb(16_42_58/0.08)] sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
