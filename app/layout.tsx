import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { CapacitorHandler } from "@/components/mobile/capacitor-handler";
import "./globals.css";
import { SITE_DESCRIPTION, SITE_NAME, SITE_ORIGIN } from "@/lib/site";

const cairo = Cairo({
  variable: "--font-sans",
  subsets: ["arabic", "latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: { default: "Nursing AI | رفيقك الذكي لدراسة التمريض", template: "%s" },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ["Nursing AI", "طلاب التمريض", "دراسة التمريض", "AI Nursing Tutor"],
  openGraph: {
    type: "website",
    locale: "ar_PS",
    url: "/",
    siteName: SITE_NAME,
    title: "Nursing AI | رفيقك الذكي لدراسة التمريض",
    description: SITE_DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: SITE_NAME, description: SITE_DESCRIPTION },
  robots: { index: true, follow: true },
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <CapacitorHandler />
        <TooltipProvider>
          {children}
          <Toaster position="top-center" richColors />
        </TooltipProvider>
      </body>
    </html>
  );
}
