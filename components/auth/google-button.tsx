import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.8 2.9-4.4 2.9-7.4Z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2.1 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.1v2.6A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.5 14a6 6 0 0 1 0-3.9V7.4H3.1a10 10 0 0 0 0 9.2L6.5 14Z" />
      <path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.7 9.7 0 0 0 12 2a10 10 0 0 0-8.9 5.4L6.5 10A5.9 5.9 0 0 1 12 5.9Z" />
    </svg>
  );
}

export function GoogleButton({ redirectTo }: { redirectTo?: string }) {
  const href = redirectTo ? `/auth/google?redirect=${encodeURIComponent(redirectTo)}` : "/auth/google";
  return (
    <Link href={href} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full gap-2")}>
      <GoogleIcon />
      المتابعة باستخدام Google
    </Link>
  );
}

export function AuthDivider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      <span>أو باستخدام البريد الإلكتروني</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
