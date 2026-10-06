import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { googleSignInEnabled } from "@/lib/auth/google";
import { currentProfile } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const profile = await currentProfile();
  if (profile) redirect(profile.role === "admin" ? "/admin" : "/dashboard");

  return (
    <Suspense>
      <LoginForm googleEnabled={googleSignInEnabled()} />
    </Suspense>
  );
}
