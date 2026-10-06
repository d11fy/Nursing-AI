import { LandingHeader } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Features } from "@/components/landing/features";
import { Disclaimer } from "@/components/landing/disclaimer";
import { LandingFooter } from "@/components/landing/footer";
import { currentProfile } from "@/lib/auth/session";

export default async function HomePage() {
  const profile = await currentProfile();
  const dashboardHref = profile ? (profile.role === "admin" ? "/admin" : "/dashboard") : null;

  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader dashboardHref={dashboardHref} />
      <main className="flex-1">
        <Hero dashboardHref={dashboardHref} />
        <HowItWorks />
        <Features />
        <Disclaimer />
      </main>
      <LandingFooter />
    </div>
  );
}
