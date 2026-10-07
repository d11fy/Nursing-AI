import { LandingHeader } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Disclaimer } from "@/components/landing/disclaimer";
import { LandingFooter } from "@/components/landing/footer";
import { currentProfile } from "@/lib/auth/session";
import { ProductSections } from "@/components/landing/product-sections";
import { getPublicSiteData } from "@/lib/public-site";
import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const [profile, publicData] = await Promise.all([currentProfile(), getPublicSiteData()]);
  const dashboardHref = profile ? (profile.role === "admin" ? "/admin" : "/dashboard") : null;

  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader dashboardHref={dashboardHref} />
      <main className="flex-1">
        <Hero dashboardHref={dashboardHref} />
        <HowItWorks />
        <ProductSections data={publicData} dashboardHref={dashboardHref} />
        <Disclaimer />
      </main>
      <LandingFooter />
    </div>
  );
}
