import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const cairo = Cairo({
  variable: "--font-sans",
  subsets: ["arabic", "latin"],
});

export const metadata: Metadata = {
  title: "Nursing AI | مساعدك الذكي في دراسة التمريض",
  description:
    "منصة تعليمية بالذكاء الاصطناعي لطلاب التمريض: اسأل، ارفع صورة، وافهم أي موضوع تمريضي بطريقة بسيطة وواضحة.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <TooltipProvider>
          {children}
          <Toaster position="top-center" richColors />
        </TooltipProvider>
      </body>
    </html>
  );
}
